pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { USDX } from "../src/USDX.sol";

contract DeployUSDX is Script {
    function run() external returns (USDX) {
        vm.startBroadcast();
        USDX usdx = new USDX();
        vm.stopBroadcast();
        return usdx;
    }
}