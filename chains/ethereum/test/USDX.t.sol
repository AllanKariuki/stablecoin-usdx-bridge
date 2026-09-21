// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {USDX} from "../src/USDX.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

/// @dev Deployed exactly the way script/USDX.s.sol deploys the real thing —
/// implementation + ERC1967Proxy, no OZ Upgrades-plugin wrapper — so this
/// suite exercises the same bytes that are actually live on Sepolia.
contract USDXTest is Test {
    USDX usdx;
    address admin = address(0xA11CE);
    address relayer = address(0xBEEF);
    address user = address(0xCAFE);
    address other = address(0xD00D);

    function setUp() public {
        USDX implementation = new USDX();
        bytes memory initData = abi.encodeCall(USDX.initialize, (admin, relayer));
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        usdx = USDX(address(proxy));
    }

    // -------------------------------------------------------------------
    // decimals — the whole point of overriding ERC20's default is that
    // both chains agree, so lock the value in as a regression test.
    // -------------------------------------------------------------------

    function test_decimals_isSix() public view {
        assertEq(usdx.decimals(), 6);
    }

    // -------------------------------------------------------------------
    // bridgeMint
    // -------------------------------------------------------------------

    function test_bridgeMint_onlyBridgeRole() public {
        vm.prank(relayer);
        usdx.bridgeMint(user, 100e6, keccak256("transfer-1"));
        assertEq(usdx.balanceOf(user), 100e6);
        assertEq(usdx.totalSupply(), 100e6);
    }

    function test_bridgeMint_revertsForNonRelayer() public {
        // usdx.BRIDGE_ROLE() must be read BEFORE vm.prank — vm.prank only
        // affects the very next external call, and reading the role inside
        // expectRevert's own arguments would consume it on that read
        // instead of on bridgeMint below.
        bytes32 role = usdx.BRIDGE_ROLE();
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, user, role));
        usdx.bridgeMint(user, 100e6, keccak256("transfer-2"));
    }

    function test_bridgeMint_revertsOnReplayedCorrelationId() public {
        bytes32 correlationId = keccak256("transfer-3");
        vm.startPrank(relayer);
        usdx.bridgeMint(user, 100e6, correlationId);
        vm.expectRevert("USDX: correlation already minted");
        usdx.bridgeMint(user, 100e6, correlationId);
        vm.stopPrank();
    }

    function test_bridgeMint_marksOnlyProcessedMints_notProcessedBurns() public {
        // Regression lock: Ethereum keeps mint and burn replay guards in
        // SEPARATE maps (processedMints/processedBurns), unlike Solana's
        // usdx_bridge program, which shares one processed_marker PDA seeded
        // off the same correlation_id for both. The two chains are meant to
        // behave differently here — this test exists so nobody "simplifies"
        // Ethereum into sharing one map and silently changes the semantics.
        bytes32 correlationId = keccak256("transfer-3b");
        vm.prank(relayer);
        usdx.bridgeMint(user, 100e6, correlationId);

        assertTrue(usdx.processedMints(correlationId));
        assertFalse(usdx.processedBurns(correlationId));

        // The same id can still be used for a burn — proving the guards are
        // genuinely independent, not just internally consistent.
        vm.prank(relayer);
        usdx.bridgeBurn(user, 10e6, correlationId);
        assertTrue(usdx.processedBurns(correlationId));
    }

    // -------------------------------------------------------------------
    // bridgeBurn
    // -------------------------------------------------------------------

    function test_bridgeBurn() public {
        vm.startPrank(relayer);
        usdx.bridgeMint(user, 100e6, keccak256("transfer-4"));
        usdx.bridgeBurn(user, 40e6, keccak256("transfer-5"));
        vm.stopPrank();
        assertEq(usdx.balanceOf(user), 60e6);
        assertEq(usdx.totalSupply(), 60e6);
    }

    function test_bridgeBurn_revertsForNonRelayer() public {
        vm.prank(relayer);
        usdx.bridgeMint(user, 100e6, keccak256("transfer-6"));

        bytes32 role = usdx.BRIDGE_ROLE();
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, user, role));
        usdx.bridgeBurn(user, 40e6, keccak256("transfer-7"));
    }

    function test_bridgeBurn_revertsOnReplayedCorrelationId() public {
        bytes32 correlationId = keccak256("transfer-8");
        vm.startPrank(relayer);
        usdx.bridgeMint(user, 100e6, keccak256("transfer-8-mint"));
        usdx.bridgeBurn(user, 10e6, correlationId);
        vm.expectRevert("USDX: correlation already burned");
        usdx.bridgeBurn(user, 10e6, correlationId);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------
    // blacklist — COMPLIANCE_ROLE, and _update() is the single chokepoint
    // that must catch mint (from == address(0)), burn (to == address(0))
    // and ordinary transfer alike.
    // -------------------------------------------------------------------

    function test_blacklist_onlyComplianceRole() public {
        bytes32 role = usdx.COMPLIANCE_ROLE();
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, user, role));
        usdx.blacklist(other);
    }

    function test_blacklist_blocksMintingToBlacklistedRecipient() public {
        vm.prank(admin);
        usdx.blacklist(user);
        assertTrue(usdx.isBlacklisted(user));

        vm.prank(relayer);
        vm.expectRevert("USDX: recipient blacklisted");
        usdx.bridgeMint(user, 100e6, keccak256("transfer-9"));
    }

    function test_blacklist_blocksBurningFromBlacklistedSender() public {
        vm.prank(relayer);
        usdx.bridgeMint(user, 100e6, keccak256("transfer-10"));

        vm.prank(admin);
        usdx.blacklist(user);

        vm.prank(relayer);
        vm.expectRevert("USDX: sender blacklisted");
        usdx.bridgeBurn(user, 10e6, keccak256("transfer-11"));
    }

    function test_blacklist_blocksTransferFromBlacklistedSender() public {
        vm.prank(relayer);
        usdx.bridgeMint(user, 100e6, keccak256("transfer-12"));

        vm.prank(admin);
        usdx.blacklist(user);

        vm.prank(user);
        vm.expectRevert("USDX: sender blacklisted");
        usdx.transfer(other, 10e6);
    }

    function test_blacklist_blocksTransferToBlacklistedRecipient() public {
        vm.prank(relayer);
        usdx.bridgeMint(user, 100e6, keccak256("transfer-12b"));

        vm.prank(admin);
        usdx.blacklist(other);

        vm.prank(user);
        vm.expectRevert("USDX: recipient blacklisted");
        usdx.transfer(other, 10e6);
    }

    function test_unblacklist_restoresTransfers() public {
        vm.prank(relayer);
        usdx.bridgeMint(user, 100e6, keccak256("transfer-13"));

        vm.startPrank(admin);
        usdx.blacklist(user);
        usdx.unblacklist(user);
        vm.stopPrank();

        assertFalse(usdx.isBlacklisted(user));
        vm.prank(user);
        usdx.transfer(other, 10e6); // does not revert
        assertEq(usdx.balanceOf(other), 10e6);
    }

    // -------------------------------------------------------------------
    // pause — PAUSER_ROLE; whenNotPaused gates the same _update chokepoint,
    // so pausing blocks mint, burn and ordinary transfer all at once.
    // -------------------------------------------------------------------

    function test_pause_onlyPauserRole() public {
        bytes32 role = usdx.PAUSER_ROLE();
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, user, role));
        usdx.pause();
    }

    function test_pause_blocksMintBurnAndTransfer() public {
        vm.prank(relayer);
        usdx.bridgeMint(user, 100e6, keccak256("transfer-14"));

        vm.prank(admin);
        usdx.pause();

        vm.startPrank(relayer);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        usdx.bridgeMint(user, 10e6, keccak256("transfer-15"));

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        usdx.bridgeBurn(user, 10e6, keccak256("transfer-16"));
        vm.stopPrank();

        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        usdx.transfer(other, 10e6);
    }

    function test_unpause_restoresOperations() public {
        vm.startPrank(admin);
        usdx.pause();
        usdx.unpause();
        vm.stopPrank();

        vm.prank(relayer);
        usdx.bridgeMint(user, 100e6, keccak256("transfer-17")); // does not revert
        assertEq(usdx.balanceOf(user), 100e6);
    }

    // -------------------------------------------------------------------
    // initialize — reinitialization guard, role setup
    // -------------------------------------------------------------------

    function test_initialize_cannotBeCalledTwice() public {
        vm.expectRevert(abi.encodeWithSignature("InvalidInitialization()"));
        usdx.initialize(admin, relayer);
    }

    function test_initialize_grantsExpectedRoles() public view {
        assertTrue(usdx.hasRole(usdx.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(usdx.hasRole(usdx.UPGRADER_ROLE(), admin));
        assertTrue(usdx.hasRole(usdx.PAUSER_ROLE(), admin));
        assertTrue(usdx.hasRole(usdx.COMPLIANCE_ROLE(), admin));
        assertTrue(usdx.hasRole(usdx.BRIDGE_ROLE(), relayer));
        assertFalse(usdx.hasRole(usdx.BRIDGE_ROLE(), admin));
    }

    // -------------------------------------------------------------------
    // UUPS upgrade — deployed and upgraded the same way script/USDX.s.sol
    // and script/Upgrade.s.sol do it (raw ERC1967Proxy + upgradeToAndCall,
    // no OZ Upgrades-plugin wrapper), so this proves the actual upgrade
    // path production uses, not a plugin-mediated one.
    // -------------------------------------------------------------------

    function test_upgrade_onlyUpgraderRole() public {
        USDXV2 v2 = new USDXV2();
        bytes32 role = usdx.UPGRADER_ROLE();
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, user, role));
        usdx.upgradeToAndCall(address(v2), "");
    }

    function test_upgrade_preservesStateAndBalances() public {
        vm.prank(relayer);
        usdx.bridgeMint(user, 100e6, keccak256("transfer-18"));

        USDXV2 v2 = new USDXV2();
        vm.prank(admin);
        usdx.upgradeToAndCall(address(v2), "");

        // Storage (balances, roles, blacklist map) survives the swap —
        // this is the entire point of the proxy pattern.
        assertEq(usdx.balanceOf(user), 100e6);
        assertTrue(usdx.hasRole(usdx.BRIDGE_ROLE(), relayer));
        assertEq(usdx.decimals(), 6);

        // And the new logic is live through the same proxy address.
        assertEq(USDXV2(address(usdx)).version(), "v2");

        // Bridge operations still work post-upgrade.
        vm.prank(relayer);
        usdx.bridgeMint(user, 10e6, keccak256("transfer-19"));
        assertEq(usdx.balanceOf(user), 110e6);
    }
}

/// @dev Test-only upgrade target. Inherits USDX rather than redeclaring its
/// storage, so the storage layout is trivially preserved — adding a pure
/// function introduces no new slots. A real V2 would follow the same rule
/// (append-only storage) and should get its own reviewed contract rather
/// than reusing this fixture.
contract USDXV2 is USDX {
    function version() external pure returns (string memory) {
        return "v2";
    }
}
