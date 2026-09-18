// contracts/USDX.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract USDX is
    Initializable,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    mapping(address => bool) public isBlacklisted;
    // Replay protection, mirrors the processed_marker PDA pattern on the
    // Solana side: a correlationId can only ever be minted/burned once.
    mapping(bytes32 => bool) public processedMints;
    mapping(bytes32 => bool) public processedBurns;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    // NOTE: `admin` holds DEFAULT_ADMIN_ROLE (and so can grant/revoke every
    // other role, including who's authorized to mint via BRIDGE_ROLE). The
    // spec calls for a multi-sig-controlled minter — point `admin` at a
    // multisig (e.g. a Gnosis Safe) address rather than an EOA to get that
    // without any extra contract code.
    function initialize(address admin, address bridgeRelayer) public initializer {
        __ERC20_init("USD-X", "USDX");
        __AccessControl_init();
        __Pausable_init();
        // UUPSUpgradeable (OZ v5) is stateless and has no __init function.

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
        _grantRole(BRIDGE_ROLE, bridgeRelayer);
    }

    // Fixed at 6 to match the Solana mint's USDX_DECIMALS (constants.rs) —
    // a burn-N-mint-N cross-chain transfer only moves equal real value if
    // both chains agree on decimals. ERC20Upgradeable defaults to 18;
    // this override is what makes the two chains actually match.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // Called by the Core Ledger when a Solana -> Ethereum transfer settles
    function bridgeMint(address to, uint256 amount, bytes32 correlationId) external onlyRole(BRIDGE_ROLE) {
        require(!processedMints[correlationId], "USDX: correlation already minted");
        processedMints[correlationId] = true;
        _mint(to, amount);
        emit BridgeMinted(to, amount, correlationId);
    }

    // Called by the Core Ledger (or directly by the user, then reported) when
    // an Ethereum -> Solana transfer is initiated
    function bridgeBurn(address from, uint256 amount, bytes32 correlationId) external onlyRole(BRIDGE_ROLE) {
        require(!processedBurns[correlationId], "USDX: correlation already burned");
        processedBurns[correlationId] = true;
        _burn(from, amount);
        emit BridgeBurned(from, amount, correlationId);
    }

    /// Emergency control: freezes all transfers, mints, and burns.
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

    // Single chokepoint for transfer/mint/burn (OZ v5's ERC20Upgradeable
    // routes all three through _update) — this is where pause and
    // blacklist enforcement actually bite.
    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        require(!isBlacklisted[from], "USDX: sender blacklisted");
        require(!isBlacklisted[to], "USDX: recipient blacklisted");
        super._update(from, to, value);
    }

    event BridgeMinted(address indexed to, uint256 amount, bytes32 correlationId);
    event BridgeBurned(address indexed from, uint256 amount, bytes32 correlationId);
    event Blacklisted(address indexed account);
    event Unblacklisted(address indexed account);

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
