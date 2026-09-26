package authz

import "testing"

// TestAdminHoldsExactlyTwentyOfTwentyFour regression-locks the
// segregation-of-duties design documented in permissions.yaml: admin is a
// platform/IT role, not a compliance or treasury one, and should never
// silently gain compliance:cases:manage, compliance:blacklist:manage,
// kyc:review, or ledger:admin just because someone added a new permission
// and forgot admin was supposed to be the exception, not the default.
func TestAdminHoldsExactlyTwentyOfTwentyFour(t *testing.T) {
	if got, want := len(allPermissions()), 24; got != want {
		t.Fatalf("expected 24 total permissions defined, got %d", got)
	}
	if got, want := len(RolePermissions[RoleAdmin]), 20; got != want {
		t.Fatalf("expected admin to hold exactly 20 of 24 permissions, got %d", got)
	}

	excluded := []Permission{
		PermissionComplianceCasesManage,
		PermissionComplianceBlacklistManage,
		PermissionKycReview,
		PermissionLedgerAdmin,
	}
	for _, perm := range excluded {
		if HasPermission(RoleAdmin, perm) {
			t.Errorf("admin must not hold %q (segregation of duties)", perm)
		}
	}
}

func TestExpandRolesUnionsAndDedupes(t *testing.T) {
	got := ExpandRoles([]Role{RoleAuditor, RoleTreasury})
	seen := map[Permission]int{}
	for _, p := range got {
		seen[p]++
	}
	for p, count := range seen {
		if count != 1 {
			t.Errorf("permission %q appeared %d times, expected exactly once", p, count)
		}
	}
	if seen[PermissionLedgerRead] == 0 {
		t.Error("expected ledger:read from either role")
	}
	if seen[PermissionLedgerAdmin] == 0 {
		t.Error("expected ledger:admin from treasury")
	}
}

func TestHasPermissionUnknownRoleIsFalse(t *testing.T) {
	if HasPermission(Role("not-a-role"), PermissionWalletsReadOwn) {
		t.Error("an unknown role must never be treated as permitted")
	}
}

// allPermissions lists every Permission constant directly, rather than
// deriving it from RolePermissions, so an orphaned permission (defined in
// permissions.yaml but granted to no role) is still counted — the point of
// this test is catching a drift between the 24 defined and what roles
// actually hold, not just re-deriving one from the other.
func allPermissions() map[Permission]bool {
	return map[Permission]bool{
		PermissionWalletsReadOwn: true, PermissionWalletsReadAny: true,
		PermissionWalletsWriteOwn: true, PermissionWalletsWriteAny: true,
		PermissionWalletsStatusManage: true, PermissionTransactionsReadOwn: true,
		PermissionTransactionsReadAny: true, PermissionTransactionsReverse: true,
		PermissionIssuanceCreate: true, PermissionRedemptionCreate: true,
		PermissionBridgeCreate: true, PermissionFxQuote: true, PermissionFxConvert: true,
		PermissionLedgerRead: true, PermissionLedgerAdmin: true,
		PermissionPaymentsReadOwn: true, PermissionPaymentsWriteOwn: true,
		PermissionPaymentsManageAny: true, PermissionKycSubmit: true, PermissionKycReview: true,
		PermissionComplianceCasesManage: true, PermissionComplianceBlacklistManage: true,
		PermissionReportsRead: true, PermissionAdminUsersManage: true,
	}
}
