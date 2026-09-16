pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { USDX } from "../src/USDX.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// Deploys the USDX implementation behind a UUPS (ERC1967) proxy and
// initializes it through that proxy — the implementation itself is left
// uninitialized (its `initialize` is only reachable via the proxy's
// delegatecall), which is the standard UUPS deployment shape.
contract DeployUSDX is Script {
    function run() external returns (USDX) {
        address admin = vm.envAddress("USDX_ADMIN");
        address bridgeRelayer = vm.envAddress("USDX_BRIDGE_RELAYER");

        vm.startBroadcast();

        USDX implementation = new USDX();
        bytes memory initData = abi.encodeCall(USDX.initialize, (admin, bridgeRelayer));
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);

        vm.stopBroadcast();

        // Callers should use this address (USDX_PROXY_ADDRESS in
        // core-ledger's env) — never the bare implementation address.
        return USDX(address(proxy));
    }
}
