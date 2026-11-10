package authz

import "testing"

// TestAdminIsNotTheDefaultRole regression-locks the segregation-of-duties
// design documented in permissions.yaml: admin is a platform/IT role, not a
// compliance or treasury one, and should never silently gain
// compliance:cases:manage, compliance:blacklist:manage, kyc:review,
// ledger:admin or reserves:manage just because someone added a new permission
// and forgot admin was supposed to be the exception, not the default.
//
// The counts are asserted as well as the exclusions: an exclusion list alone
// would still pass if a *sixth* sensitive permission were added and quietly
// granted to admin.
func TestAdminIsNotTheDefaultRole(t *testing.T) {
	const totalPermissions = 26
	// 26 defined minus the 5 excluded below.
	const adminPermissions = 21

	if got := len(allPermissions()); got != totalPermissions {
		t.Fatalf("expected %d total permissions defined, got %d", totalPermissions, got)
	}
	if got := len(RolePermissions[RoleAdmin]); got != adminPermissions {
		t.Fatalf("expected admin to hold exactly %d of %d permissions, got %d",
			adminPermissions, totalPermissions, got)
	}

	excluded := []Permission{
		PermissionComplianceCasesManage,
		PermissionComplianceBlacklistManage,
		PermissionKycReview,
		PermissionLedgerAdmin,
		// reserves:manage can arm a custodian drift and edit reserve targets,
		// which between them can make a reconciliation break appear or
		// disappear. Whoever runs the platform must not also be able to
		// change what the control watching it reports.
		PermissionReservesManage,
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
// this test is catching a drift between what is defined and what roles
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
		PermissionReservesRead: true, PermissionReservesManage: true,
		PermissionReportsRead: true, PermissionAdminUsersManage: true,
	}
}
