// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {USDX} from "../src/USDX.sol";

/// Upgrades the live USDX proxy to a new implementation, deployed and
/// reviewed separately from this script (never bundled in the same
/// transaction as the upgrade) so the bytecode being pointed at is known
/// and auditable before UPGRADER_ROLE ever signs for it.
///
/// USDX_PROXY_ADDRESS is the ERC1967 proxy (0xba07d6..., see README) —
/// never the bare implementation. USDX_NEW_IMPLEMENTATION is the address
/// of an already-deployed, already-reviewed implementation contract.
///
///   forge script script/Upgrade.s.sol --rpc-url sepolia --broadcast
///
/// Dry-run against a fork first, always:
///   forge script script/Upgrade.s.sol --fork-url sepolia
contract UpgradeUSDX is Script {
    function run() external {
        address proxyAddress = vm.envAddress("USDX_PROXY_ADDRESS");
        address newImplementation = vm.envAddress("USDX_NEW_IMPLEMENTATION");

        vm.startBroadcast();
        // upgradeToAndCall's second argument is calldata for an
        // initializer on the new implementation, if the upgrade needs one
        // (e.g. to set a newly-added storage variable). Empty here because
        // no upgrade target exists yet that needs one — a real V2 with new
        // state should extend this call accordingly.
        USDX(proxyAddress).upgradeToAndCall(newImplementation, "");
        vm.stopBroadcast();
    }
}
