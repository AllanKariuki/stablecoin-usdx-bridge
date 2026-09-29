// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {USDX} from "./USDX.sol";

/// @title USDXV2
/// @notice The upgrade P6 calls for: resolve the `bridgeBurn` asymmetry, and
///         give the platform a way to retire an unlimited burn power it
///         should never have had.
///
/// @dev Storage is append-only. USDXV2 inherits USDX rather than redeclaring
///      its layout, and every new variable is declared *after* the inherited
///      ones — which is what makes this a safe UUPS upgrade of a live proxy.
///      The `__gap` at the end reserves room for a V3 without pushing an
///      inherited slot.
///
///      What this does NOT do is change the *shape* of bridgeMint/bridgeBurn.
///      core-ledger's ChainClient interface and the generated bindings stay
///      valid across the upgrade, so a ledger running the old bindings against
///      a V2 proxy keeps working. That property is why the new behaviour is
///      opt-in through a flag rather than a signature change.
contract USDXV2 is USDX {
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
    function initializeV2(bool requireAllowance) external reinitializer(2) {
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
    function bridgeBurn(address from, uint256 amount, bytes32 correlationId)
        external
        override
        onlyRole(BRIDGE_ROLE)
    {
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

    function version() external pure returns (string memory) {
        return "v2";
    }
}
