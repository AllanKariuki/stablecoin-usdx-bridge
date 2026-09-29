// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {USDX} from "../src/USDX.sol";
import {USDXV2} from "../src/USDXV2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

/// @dev The upgrade P6 calls for, tested through a real proxy upgrade rather
/// than by deploying V2 directly — because the things most likely to be wrong
/// about a UUPS upgrade are the things a fresh deployment never exercises:
/// storage layout, a reinitializer that must run exactly once, and balances
/// surviving the implementation swap.
contract USDXV2Test is Test {
    USDXV2 usdx;
    address admin = address(0xA11CE);
    address relayer = address(0xBEEF);
    address user = address(0xCAFE);
    address custody = address(0xC0FFEE);

    function setUp() public {
        // Deploy V1 exactly as script/USDX.s.sol does, mint under V1's rules,
        // then upgrade — so every assertion below is about a proxy that has
        // real pre-upgrade state, not a clean slate.
        USDX implementation = new USDX();
        bytes memory initData = abi.encodeCall(USDX.initialize, (admin, relayer));
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        USDX v1 = USDX(address(proxy));

        vm.prank(relayer);
        v1.bridgeMint(user, 100e6, keccak256("pre-upgrade"));

        USDXV2 v2 = new USDXV2();
        vm.prank(admin);
        v1.upgradeToAndCall(address(v2), "");

        usdx = USDXV2(address(proxy));
    }

    // -------------------------------------------------------------------
    // The upgrade itself
    // -------------------------------------------------------------------

    function test_upgrade_preservesBalancesAndRoles() public view {
        assertEq(usdx.balanceOf(user), 100e6);
        assertEq(usdx.totalSupply(), 100e6);
        assertEq(usdx.decimals(), 6);
        assertTrue(usdx.hasRole(usdx.BRIDGE_ROLE(), relayer));
        assertEq(usdx.version(), "v2");
    }

    /// The flag must default OFF on upgrade. Turning it on atomically would
    /// strand every in-flight bridge: a burn whose journal leg was already
    /// posted under V1's rules would revert for want of an allowance nobody
    /// was asked for, and the saga would retry it until its budget ran out.
    function test_upgrade_leavesBurnAllowanceRequirementOff() public view {
        assertFalse(usdx.requireBurnAllowance());
    }

    /// With the flag off, V2's bridgeBurn is V1's. The migration path depends
    /// on that: upgrade, let the queue drain, have holders approve, then
    /// enable.
    function test_bridgeBurn_behavesLikeV1WhileTheFlagIsOff() public {
        vm.prank(relayer);
        usdx.bridgeBurn(user, 40e6, keccak256("burn-1"));
        assertEq(usdx.balanceOf(user), 60e6);
    }

    function test_initializeV2_runsOnceAndSetsTheFlag() public {
        vm.prank(admin);
        usdx.initializeV2(true);
        assertTrue(usdx.requireBurnAllowance());

        // reinitializer(2) — a second call must revert, or an upgrade could be
        // re-initialized by anyone who noticed it hadn't been.
        vm.expectRevert();
        usdx.initializeV2(false);
    }

    // -------------------------------------------------------------------
    // The asymmetry P6 closes
    //
    // V1's bridgeBurn burns any holder unconditionally under BRIDGE_ROLE.
    // Solana's has always been bounded by a delegation the owner granted.
    // The difference matters most in the case nobody plans for: a leaked
    // BRIDGE_ROLE key on Ethereum can burn every holder's balance, including
    // self-custodied holders who never touched the bridge.
    // -------------------------------------------------------------------

    function test_bridgeBurn_requiresAnAllowanceWhenEnabled() public {
        vm.prank(admin);
        usdx.setRequireBurnAllowance(true);

        // No allowance: the burn is refused. This is the whole point — a
        // holder's exposure to a compromised relayer key is now bounded by
        // what they approved.
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(usdx), 0, 40e6)
        );
        usdx.bridgeBurn(user, 40e6, keccak256("burn-no-allowance"));

        assertEq(usdx.balanceOf(user), 100e6, "a refused burn must not move anything");
    }

    function test_bridgeBurn_consumesTheAllowanceWhenEnabled() public {
        vm.prank(admin);
        usdx.setRequireBurnAllowance(true);

        // Standard ERC-20 approve — no new mechanism for a holder to learn.
        vm.prank(user);
        usdx.approve(address(usdx), 50e6);

        vm.prank(relayer);
        usdx.bridgeBurn(user, 40e6, keccak256("burn-allowed"));

        assertEq(usdx.balanceOf(user), 60e6);
        // Decremented, not merely checked: a second burn cannot reuse the
        // same approval.
        assertEq(usdx.allowance(user, address(usdx)), 10e6);
    }

    function test_bridgeBurn_cannotExceedTheAllowance() public {
        vm.prank(admin);
        usdx.setRequireBurnAllowance(true);

        vm.prank(user);
        usdx.approve(address(usdx), 10e6);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(usdx), 10e6, 40e6)
        );
        usdx.bridgeBurn(user, 40e6, keccak256("burn-over"));
    }

    /// The platform's own custody addresses hold pooled balances the bridge
    /// burns from on every redemption. Requiring them to keep an allowance
    /// topped up would add a failure mode — allowance exhausted mid-redemption
    /// — to the path that must not have one.
    function test_bridgeBurn_exemptAddressesSkipTheAllowanceCheck() public {
        vm.prank(relayer);
        usdx.bridgeMint(custody, 500e6, keccak256("fund-custody"));

        vm.startPrank(admin);
        usdx.setRequireBurnAllowance(true);
        usdx.setBurnAllowanceExempt(custody, true);
        vm.stopPrank();

        vm.prank(relayer);
        usdx.bridgeBurn(custody, 200e6, keccak256("burn-custody"));
        assertEq(usdx.balanceOf(custody), 300e6);
    }

    function test_setRequireBurnAllowance_onlyAdmin() public {
        // The role is read before the prank: vm.prank applies to the *next*
        // call, and a getter evaluated inside expectRevert's argument would
        // consume it — leaving the revert expectation checked against a call
        // made by the test contract rather than by `relayer`.
        bytes32 adminRole = usdx.DEFAULT_ADMIN_ROLE();

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, relayer, adminRole)
        );
        usdx.setRequireBurnAllowance(true);
    }

    function test_setBurnAllowanceExempt_onlyAdmin() public {
        bytes32 adminRole = usdx.DEFAULT_ADMIN_ROLE();

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, user, adminRole)
        );
        usdx.setBurnAllowanceExempt(user, true);
    }

    // -------------------------------------------------------------------
    // What the override must NOT have broken
    // -------------------------------------------------------------------

    /// The replay guard is re-implemented in V2's override rather than
    /// inherited, so it needs its own regression test: a correlation id must
    /// still only ever burn once.
    function test_bridgeBurn_stillRejectsAReplayedCorrelationId() public {
        bytes32 id = keccak256("replay");

        vm.prank(relayer);
        usdx.bridgeBurn(user, 10e6, id);

        vm.prank(relayer);
        vm.expectRevert("USDX: correlation already burned");
        usdx.bridgeBurn(user, 10e6, id);
    }

    /// And a failed burn must not consume the replay slot. If it did, a burn
    /// that reverted for want of an allowance could never be retried after
    /// the holder approved — the saga would be permanently stuck on a
    /// correlation id the contract considers spent.
    function test_bridgeBurn_aRefusedBurnLeavesTheCorrelationIdUsable() public {
        bytes32 id = keccak256("retry-after-approve");

        vm.prank(admin);
        usdx.setRequireBurnAllowance(true);

        vm.prank(relayer);
        vm.expectRevert();
        usdx.bridgeBurn(user, 40e6, id);

        vm.prank(user);
        usdx.approve(address(usdx), 40e6);

        vm.prank(relayer);
        usdx.bridgeBurn(user, 40e6, id);
        assertEq(usdx.balanceOf(user), 60e6);
    }

    function test_bridgeBurn_stillOnlyBridgeRole() public {
        bytes32 bridgeRole = usdx.BRIDGE_ROLE();

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, user, bridgeRole)
        );
        usdx.bridgeBurn(user, 1e6, keccak256("not-relayer"));
    }

    function test_bridgeBurn_stillBlockedWhilePaused() public {
        vm.prank(admin);
        usdx.pause();

        vm.prank(relayer);
        vm.expectRevert();
        usdx.bridgeBurn(user, 1e6, keccak256("while-paused"));
    }
}
