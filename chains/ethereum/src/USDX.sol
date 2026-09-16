// contracts/USDX.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract USDX is
    Initializable,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address admin, address bridgeRelayer) public initializer {
        __ERC20_init("USD-X", "USDX");
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(BRIDGE_ROLE, bridgeRelayer);
    }

    // Called by the Core Ledger when a Solana -> Ethereum transfer settles
    function bridgeMint(address to, uint256 amount, bytes32 correlationId) external onlyRole(BRIDGE_ROLE) {
        _mint(to, amount);
        emit BridgeMinted(to, amount, correlationId);
    }

    // Called by the Core Ledger (or directly by the user, then reported) when
    // an Ethereum -> Solana transfer is initiated
    function bridgeBurn(address from, uint256 amount, bytes32 correlationId) external onlyRole(BRIDGE_ROLE) {
        _burn(from, amount);
        emit BridgeBurned(from, amount, correlationId);
    }

    event BridgeMinted(address indexed to, uint256 amount, bytes32 correlationId);
    event BridgeBurned(address indexed from, uint256 amount, bytes32 correlationId);

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}