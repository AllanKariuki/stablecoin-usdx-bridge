package authztable_test

import (
	"testing"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/auth-proxy/internal/authztable"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/authz/generated"
)

func TestMatch_ParamSegmentMatchesAnyValue(t *testing.T) {
	rule, found := authztable.Default.Match("GET", "/wallets/abc-123")
	if !found {
		t.Fatal("expected /wallets/:walletId to match /wallets/abc-123")
	}
	if rule.Path != "/wallets/:walletId" {
		t.Errorf("expected the :walletId rule, matched %q", rule.Path)
	}
}

func TestMatch_MethodMustMatch(t *testing.T) {
	if _, found := authztable.Default.Match("DELETE", "/wallets/abc-123"); found {
		t.Fatal("expected no rule for DELETE /wallets/:walletId")
	}
}

func TestMatch_UnlistedRouteDeniedByDefault(t *testing.T) {
	if _, found := authztable.Default.Match("GET", "/definitely/not/a/real/route"); found {
		t.Fatal("expected an unlisted route to have no matching rule (deny by default)")
	}
}

func TestMatch_DoesNotMatchExtraPathSegments(t *testing.T) {
	// /wallets/:walletId/statement is a distinct, more specific rule —
	// /wallets/abc/statement must not also satisfy the bare /wallets/:walletId
	// pattern's regexp by accident.
	rule, found := authztable.Default.Match("GET", "/wallets/abc-123/statement")
	if !found {
		t.Fatal("expected a match for the statement route")
	}
	if rule.Path != "/wallets/:walletId/statement" {
		t.Errorf("expected the statement-specific rule, matched %q", rule.Path)
	}
}

func TestAllows_AnyOfIsSufficient(t *testing.T) {
	rule, found := authztable.Default.Match("GET", "/wallets/abc-123")
	if !found {
		t.Fatal("setup: expected a match")
	}
	if !rule.Allows([]authz.Permission{authz.PermissionWalletsReadAny}) {
		t.Error("expected wallets:read:any alone to satisfy the wallet-read rule")
	}
	if !rule.Allows([]authz.Permission{authz.PermissionWalletsReadOwn}) {
		t.Error("expected wallets:read:own alone to satisfy the wallet-read rule")
	}
}

func TestAllows_UnrelatedPermissionInsufficient(t *testing.T) {
	rule, found := authztable.Default.Match("POST", "/ledger/closures")
	if !found {
		t.Fatal("setup: expected a match")
	}
	if rule.Allows([]authz.Permission{authz.PermissionFxQuote}) {
		t.Error("fx:quote must not satisfy a ledger:admin-only rule")
	}
	if !rule.Allows([]authz.Permission{authz.PermissionLedgerAdmin}) {
		t.Error("expected ledger:admin to satisfy the closures rule")
	}
}

func TestDeposits_RequireManualDepositPermission(t *testing.T) {
	rule, found := authztable.Default.Match("POST", "/deposits")
	if !found {
		t.Fatal("setup: expected a rule for POST /deposits")
	}
	if !rule.Allows([]authz.Permission{authz.PermissionWalletsDepositManual}) {
		t.Error("expected wallets:deposit:manual to authorize a manual deposit")
	}
	// A customer holds wallets:write:own; that must not be enough to credit a
	// wallet with no rail behind it.
	if rule.Allows(authz.RolePermissions[authz.RoleCustomer]) {
		t.Error("the customer role must not be able to POST /deposits")
	}
	if rule.Allows([]authz.Permission{authz.PermissionWalletsWriteOwn, authz.PermissionWalletsWriteAny}) {
		t.Error("wallets:write:own/:any must not authorize a manual deposit")
	}
	if !rule.Allows(authz.RolePermissions[authz.RoleTreasury]) {
		t.Error("expected the treasury role to hold wallets:deposit:manual")
	}
}
