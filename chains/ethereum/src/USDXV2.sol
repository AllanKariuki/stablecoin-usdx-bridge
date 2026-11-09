// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title USDXV2
/// @notice The upgrade P6 calls for: resolve the `bridgeBurn` asymmetry, and
///         give the platform a way to retire an unlimited burn power it
///         should never have had.
///
/// @dev **Deliberately standalone — it does not inherit USDX.** USDX.sol is
///      pinned to compile byte-for-byte to the implementation live on
///      Sepolia (see foundry.toml), and inheriting it would have required
///      editing it (`virtual` on bridgeMint/bridgeBurn), which changes its
///      metadata hash and breaks the exact-match check. So V2 re-declares V1's
///      bodies. The price is duplication; the risk it creates is storage-layout
///      drift, which is why the declaration order below must match USDX.sol
///      exactly — same bases in the same order, same three mappings first —
///      and why test_upgrade_preservesV1State exists. New variables go *after*
///      V1's, and `__gap` reserves room for a V3.
///
///      What this does NOT do is change the *shape* of bridgeMint/bridgeBurn.
///      core-ledger's ChainClient interface and the generated bindings stay
///      valid across the upgrade, so a ledger running the old bindings against
///      a V2 proxy keeps working. That property is why the new behaviour is
///      opt-in through a flag rather than a signature change.
contract USDXV2 is Initializable, ERC20Upgradeable, AccessControlUpgradeable, PausableUpgradeable, UUPSUpgradeable {
    // ---- V1 declarations, verbatim from USDX.sol (layout-critical) ----
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    mapping(address => bool) public isBlacklisted;
    mapping(bytes32 => bool) public processedMints;
    mapping(bytes32 => bool) public processedBurns;

    event BridgeMinted(address indexed to, uint256 amount, bytes32 correlationId);
    event BridgeBurned(address indexed from, uint256 amount, bytes32 correlationId);
    event Blacklisted(address indexed account);
    event Unblacklisted(address indexed account);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ---------------------------------------------------------------------
    // The asymmetry
    //
    // Ethereum's bridgeBurn burns any holder unconditionally under
    // BRIDGE_ROLE. Solana's requires the token account's owner to have
    // granted an SPL delegate first. P2 resolved the *functional* half of
    // that gap by making Solana platform-custodied — the platform owns the
    // ATA, so it can grant its own delegation — but it left the trust models
    // still different: on Solana the bridge's power is bounded by a
    // delegation the owner granted, and on Ethereum it is unbounded.
    //
    // That difference matters most in the case nobody plans for. A leaked
    // BRIDGE_ROLE key on Solana can burn what the platform delegated. The
    // same leak on Ethereum can burn *every holder's balance*, including
    // self-custodied holders who never interacted with the bridge.
    //
    // requireBurnAllowance closes it by making Ethereum's burn bounded too:
    // a holder grants the contract an ERC-20 allowance (standard `approve`,
    // no new mechanism to learn), and bridgeBurn spends it.
    // ---------------------------------------------------------------------

    /// @notice When true, bridgeBurn consumes the holder's ERC-20 allowance to
    ///         this contract rather than burning unconditionally.
    /// @dev Defaults to false on upgrade, deliberately. Flipping it on in the
    ///      same transaction as the upgrade would strand every in-flight
    ///      bridge: a burn whose journal leg was already posted under the old
    ///      rules would revert for want of an allowance nobody was asked for,
    ///      and the saga would retry it until its budget ran out. The
    ///      migration is: upgrade, let the queue drain, have holders approve,
    ///      then enable.
    bool public requireBurnAllowance;

    /// @notice A per-holder exemption from the allowance requirement.
    /// @dev The platform's own custody addresses need it: they hold pooled
    ///      balances the bridge burns from on every redemption, and requiring
    ///      them to keep an allowance topped up would add a failure mode
    ///      (allowance exhausted mid-redemption) to the path that must not
    ///      have one. An exemption is not a back door — it is scoped to
    ///      addresses DEFAULT_ADMIN_ROLE names, and every grant emits.
    mapping(address => bool) public burnAllowanceExempt;

    event BurnAllowanceRequirementSet(bool required);
    event BurnAllowanceExemptionSet(address indexed account, bool exempt);

    /// @dev Reserved so a V3 can add state without shifting an inherited
    ///      slot. 48 words is the OpenZeppelin convention for a contract that
    ///      has used two.
    uint256[48] private __gap;

    // ---------------------------------------------------------------------

    /// @notice Initializer for the upgrade, if a deployment wants to set the
    ///         flag atomically with `upgradeToAndCall`.
    /// @dev reinitializer(2), not initializer: the proxy's storage has
    ///      already been initialized once by USDX.initialize, and running that
    ///      again would revert. Version 2 can only ever run once.
    ///
    ///      Gated on UPGRADER_ROLE. Ungated, anyone could call it in the gap
    ///      between `upgradeToAndCall(impl, "")` and the admin's own call,
    ///      flipping requireBurnAllowance on (stranding in-flight bridges, the
    ///      exact thing the flag defaults off to avoid) and spending the one
    ///      version-2 initialization. Under `upgradeToAndCall` the proxy
    ///      delegatecalls, so msg.sender is still the upgrader and the gate
    ///      passes for the atomic path.
    function initializeV2(bool requireAllowance) external reinitializer(2) onlyRole(UPGRADER_ROLE) {
        requireBurnAllowance = requireAllowance;
        emit BurnAllowanceRequirementSet(requireAllowance);
    }

    function setRequireBurnAllowance(bool required) external onlyRole(DEFAULT_ADMIN_ROLE) {
        requireBurnAllowance = required;
        emit BurnAllowanceRequirementSet(required);
    }

    function setBurnAllowanceExempt(address account, bool exempt) external onlyRole(DEFAULT_ADMIN_ROLE) {
        burnAllowanceExempt[account] = exempt;
        emit BurnAllowanceExemptionSet(account, exempt);
    }

    /// @notice Burn USD-X as part of a bridge or redemption.
    /// @dev Overrides USDX.bridgeBurn to consume an allowance when the flag is
    ///      on. The replay guard, the role gate and the event are unchanged —
    ///      re-implemented here rather than delegated to `super` because
    ///      `_spendAllowance` has to happen *before* the burn and *after* the
    ///      replay check, and there is no ordering of a `super` call that
    ///      produces that.
    function bridgeBurn(address from, uint256 amount, bytes32 correlationId) external onlyRole(BRIDGE_ROLE) {
        require(!processedBurns[correlationId], "USDX: correlation already burned");
        processedBurns[correlationId] = true;

        if (requireBurnAllowance && !burnAllowanceExempt[from]) {
            // _spendAllowance reverts with ERC20InsufficientAllowance when
            // there isn't enough, and decrements when there is — so a holder's
            // exposure to a compromised BRIDGE_ROLE key is bounded by what
            // they approved, which is the property Solana has had all along.
            _spendAllowance(from, address(this), amount);
        }

        _burn(from, amount);
        emit BridgeBurned(from, amount, correlationId);
    }

    // ---- the rest of V1's surface, unchanged ----

    function initialize(address admin, address bridgeRelayer) public initializer {
        __ERC20_init("USD-X", "USDX");
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
        _grantRole(BRIDGE_ROLE, bridgeRelayer);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function bridgeMint(address to, uint256 amount, bytes32 correlationId) external onlyRole(BRIDGE_ROLE) {
        require(!processedMints[correlationId], "USDX: correlation already minted");
        processedMints[correlationId] = true;
        _mint(to, amount);
        emit BridgeMinted(to, amount, correlationId);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function blacklist(address account) external onlyRole(COMPLIANCE_ROLE) {
        isBlacklisted[account] = true;
        emit Blacklisted(account);
    }

    function unblacklist(address account) external onlyRole(COMPLIANCE_ROLE) {
        isBlacklisted[account] = false;
        emit Unblacklisted(account);
    }

    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        require(!isBlacklisted[from], "USDX: sender blacklisted");
        require(!isBlacklisted[to], "USDX: recipient blacklisted");
        super._update(from, to, value);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    function version() external pure returns (string memory) {
        return "v2";
    }
}
