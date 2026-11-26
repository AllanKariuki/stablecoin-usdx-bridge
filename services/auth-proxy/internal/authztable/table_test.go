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

func TestManualAdjustments_RequireAdjustPermission(t *testing.T) {
	// Both routes move fiat with no payment rail behind them, so the same
	// permission gates them — in either direction.
	for _, path := range []string{"/deposits", "/withdrawals"} {
		rule, found := authztable.Default.Match("POST", path)
		if !found {
			t.Fatalf("setup: expected a rule for POST %s", path)
		}
		if !rule.Allows([]authz.Permission{authz.PermissionWalletsAdjustManual}) {
			t.Errorf("expected wallets:adjust:manual to authorize POST %s", path)
		}
		// A customer holds wallets:write:own; that must not be enough to move
		// fiat with no rail behind it.
		if rule.Allows(authz.RolePermissions[authz.RoleCustomer]) {
			t.Errorf("the customer role must not be able to POST %s", path)
		}
		if rule.Allows([]authz.Permission{authz.PermissionWalletsWriteOwn, authz.PermissionWalletsWriteAny}) {
			t.Errorf("wallets:write:own/:any must not authorize POST %s", path)
		}
		if !rule.Allows(authz.RolePermissions[authz.RoleTreasury]) {
			t.Errorf("expected the treasury role to hold wallets:adjust:manual (POST %s)", path)
		}
	}
}

func TestExposureAndPricing_ReadVsManage(t *testing.T) {
	// Reads are gated on reserves:read; the writes on reserves:manage. The
	// same split as reserves/attestations — the treasury role holds both,
	// admin holds reserves:read only, so the writes must not be reachable
	// with reserves:read alone.
	read := []struct{ method, path string }{
		{"GET", "/exposure"},
		{"GET", "/exposure/limits/BTC"},
		{"GET", "/treasury/rebalances"},
		{"GET", "/pricing/pairs"},
		{"GET", "/pricing/rates"},
	}
	for _, r := range read {
		rule, found := authztable.Default.Match(r.method, r.path)
		if !found {
			t.Fatalf("setup: expected a rule for %s %s", r.method, r.path)
		}
		if !rule.Allows([]authz.Permission{authz.PermissionReservesRead}) {
			t.Errorf("expected reserves:read to authorize %s %s", r.method, r.path)
		}
		if !rule.Allows(authz.RolePermissions[authz.RoleTreasury]) {
			t.Errorf("expected the treasury role to authorize %s %s", r.method, r.path)
		}
	}

	manage := []struct{ method, path string }{
		{"PUT", "/exposure/limits/BTC"},
		{"POST", "/treasury/rebalances"},
		{"PATCH", "/pricing/pairs/BTC/USD"},
	}
	for _, r := range manage {
		rule, found := authztable.Default.Match(r.method, r.path)
		if !found {
			t.Fatalf("setup: expected a rule for %s %s", r.method, r.path)
		}
		if rule.Allows([]authz.Permission{authz.PermissionReservesRead}) {
			t.Errorf("reserves:read alone must not authorize %s %s", r.method, r.path)
		}
		if !rule.Allows([]authz.Permission{authz.PermissionReservesManage}) {
			t.Errorf("expected reserves:manage to authorize %s %s", r.method, r.path)
		}
		// admin holds reserves:read but not reserves:manage (segregation of
		// duties), so a write must not be reachable with the admin role.
		if rule.Allows(authz.RolePermissions[authz.RoleAdmin]) {
			t.Errorf("the admin role must not be able to %s %s", r.method, r.path)
		}
		if !rule.Allows(authz.RolePermissions[authz.RoleTreasury]) {
			t.Errorf("expected the treasury role to authorize %s %s", r.method, r.path)
		}
	}
}

func TestTransfers_RemainAvailableToCustomers(t *testing.T) {
	rule, found := authztable.Default.Match("POST", "/transfers")
	if !found {
		t.Fatal("setup: expected a rule for POST /transfers")
	}
	if !rule.Allows(authz.RolePermissions[authz.RoleCustomer]) {
		t.Error("customers must still be able to transfer between their own wallets")
	}
}

// Slice 4b: the portal money API. Every route is reachable with the
// customer role alone (the portal's audience), and the permission split is
// what the rule names it: quoting is fx:quote, converting is fx:convert,
// reading your conversion history is transactions:read:own, and the wallet
// writes sit on wallets:write:own — never, say, on fx:quote alone.
func TestPortalMoneyApi_CustomerSurface(t *testing.T) {
	cases := []struct {
		method, path    string
		permission      authz.Permission
		denyPermissions []authz.Permission
	}{
		{"GET", "/currencies", authz.PermissionWalletsReadOwn, nil},
		{"POST", "/wallets", authz.PermissionWalletsWriteOwn, []authz.Permission{authz.PermissionWalletsReadOwn}},
		{"PATCH", "/wallets/w-1", authz.PermissionWalletsWriteOwn, []authz.Permission{authz.PermissionWalletsReadOwn}},
		{"POST", "/quotes", authz.PermissionFxQuote, []authz.Permission{authz.PermissionFxConvert, authz.PermissionWalletsWriteOwn}},
		{"POST", "/conversions", authz.PermissionFxConvert, []authz.Permission{authz.PermissionFxQuote}},
		{"GET", "/conversions", authz.PermissionTransactionsReadOwn, []authz.Permission{authz.PermissionWalletsReadOwn}},
		{"GET", "/rates", authz.PermissionWalletsReadOwn, []authz.Permission{authz.PermissionFxQuote}},
		{"GET", "/rates/history", authz.PermissionWalletsReadOwn, []authz.Permission{authz.PermissionFxQuote}},
	}
	for _, tc := range cases {
		rule, found := authztable.Default.Match(tc.method, tc.path)
		if !found {
			t.Fatalf("expected a rule for %s %s", tc.method, tc.path)
		}
		if !rule.Allows(authz.RolePermissions[authz.RoleCustomer]) {
			t.Errorf("the customer role must reach %s %s", tc.method, tc.path)
		}
		if !rule.Allows([]authz.Permission{tc.permission}) {
			t.Errorf("expected %s alone to authorize %s %s", tc.permission, tc.method, tc.path)
		}
		for _, deny := range tc.denyPermissions {
			if rule.Allows([]authz.Permission{deny}) {
				t.Errorf("%s must not authorize %s %s", deny, tc.method, tc.path)
			}
		}
	}
}

// The customer /rates paths must not unlock the ops console's /pricing/*
// surface (reserves:read), and vice versa: a customer reaches their own
// rates board, never the treasury one.
func TestPortalRates_AreNotTheOpsPricingSurface(t *testing.T) {
	customer := authz.RolePermissions[authz.RoleCustomer]
	if rule, found := authztable.Default.Match("GET", "/pricing/rates"); !found || rule.Allows(customer) {
		t.Error("the customer role must not reach GET /pricing/rates (reserves:read)")
	}
	if rule, found := authztable.Default.Match("GET", "/rates/history"); !found || !rule.Allows(customer) {
		t.Error("the customer role must reach GET /rates/history")
	}
	// An auditor (wallets:read:any, no wallets:read:own) holds none of the
	// customer-rate permissions, so the portal rates stay a customer surface.
	if rule, found := authztable.Default.Match("GET", "/rates"); !found || rule.Allows(authz.RolePermissions[authz.RoleAuditor]) {
		t.Error("the auditor role must not reach GET /rates (wallets:read:own)")
	}
}

// POST /wallets must not capture the USD-X route: /wallets/usdx keeps its
// own rule (write:own) and the bare route must not match it or vice versa.
func TestPortalWallets_UsdxRouteKeepsItsOwnRule(t *testing.T) {
	rule, found := authztable.Default.Match("POST", "/wallets/usdx")
	if !found {
		t.Fatal("expected a rule for POST /wallets/usdx")
	}
	if rule.Path != "/wallets/usdx" {
		t.Errorf("POST /wallets/usdx matched %q, want the usdx-specific rule", rule.Path)
	}
}
