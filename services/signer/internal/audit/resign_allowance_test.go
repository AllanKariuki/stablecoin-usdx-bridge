package audit

import (
	"context"
	"errors"
	"testing"
	"time"
)

// The H7 allowance is a database feature twice over: the cap honouring the
// extra is enforced in the same SERIALIZABLE transaction as the append, and
// the grant itself is a row in the hash chain. A fake would confirm the Go
// code and neither of those, so these run against real Postgres like the
// rest of this package.
//
//	SIGNER_TEST_DATABASE_URL='postgres://signer:signer@localhost:55433/signer_test?sslmode=disable' \
//	  go test ./services/signer/internal/audit/

// capAndExtra grants extra on top of a cap of 2 and returns the log.
func capAndExtra(t *testing.T, correlation string, extra int) (*Log, error) {
	t.Helper()
	log, _ := testLog(t)
	log.LimitResigns(2)
	if err := log.Append(context.Background(), record(correlation, OutcomeAllowed, "500")); err != nil {
		return nil, err
	}
	for i := 1; i <= 2; i++ {
		if err := log.Append(context.Background(), rebuilt(correlation, i)); err != nil {
			return nil, err
		}
	}
	_, err := log.GrantResignAllowance(context.Background(), correlation, extra, "ops", "test allowance", time.Now().Add(time.Hour))
	return log, err
}

// The allowance buys exactly `extra` re-signs and no more: the effective cap
// is the configured cap plus the extra, and it is enforced inside Append,
// not just in the handler's pre-check.
func TestResignAllowanceBuysExactlyExtraResigns(t *testing.T) {
	correlation := uniqueCorrelation(t)
	log, err := capAndExtra(t, correlation, 3)
	if err != nil {
		t.Fatalf("granting: %v", err)
	}

	for i := 3; i <= 5; i++ {
		if ok, err := log.ResignAllowed(context.Background(), "ETHEREUM", "bridgeMint", correlation); err != nil || !ok {
			t.Fatalf("ResignAllowed before re-sign %d = %v, %v; want true", i, ok, err)
		}
		if err := log.Append(context.Background(), rebuilt(correlation, i)); err != nil {
			t.Fatalf("re-sign %d within cap+extra: %v", i, err)
		}
	}

	if ok, err := log.ResignAllowed(context.Background(), "ETHEREUM", "bridgeMint", correlation); err != nil || ok {
		t.Fatalf("ResignAllowed past cap+extra = %v, %v; want false", ok, err)
	}
	if err := log.Append(context.Background(), rebuilt(correlation, 6)); !errors.Is(err, ErrResignLimit) {
		t.Fatalf("re-sign past cap+extra: err = %v, want ErrResignLimit", err)
	}
	if got := allowedCount(t, log, correlation); got != 6 {
		t.Fatalf("%d signatures recorded, want 6 (first + 2 capped + 3 allowance)", got)
	}
}

// Without an allowance the cap is unchanged — the allowance is extra on top,
// not instead of.
func TestResignAllowanceIsExtraNotAReply(t *testing.T) {
	log, ctx := testLog(t)
	log.LimitResigns(2)
	correlation := uniqueCorrelation(t)

	if err := log.Append(ctx, record(correlation, OutcomeAllowed, "500")); err != nil {
		t.Fatal(err)
	}
	_, err := log.GrantResignAllowance(ctx, correlation, 5, "ops", "test", time.Now().Add(time.Hour))
	if err != nil {
		t.Fatalf("granting before the cap is reached: %v", err)
	}
	for i := 1; i <= 2; i++ {
		if err := log.Append(ctx, rebuilt(correlation, i)); err != nil {
			t.Fatalf("re-sign %d: %v", i, err)
		}
	}
	// Only the allowance's five remain; the configured two are spent.
	for i := 3; i <= 7; i++ {
		if err := log.Append(ctx, rebuilt(correlation, i)); err != nil {
			t.Fatalf("re-sign %d within the allowance: %v", i, err)
		}
	}
	if err := log.Append(ctx, rebuilt(correlation, 8)); !errors.Is(err, ErrResignLimit) {
		t.Fatalf("re-sign past cap+extra: err = %v, want ErrResignLimit", err)
	}
	if got := allowedCount(t, log, correlation); got != 8 {
		t.Fatalf("%d signatures recorded, want 8 (first + 2 + 5)", got)
	}
}

// An expired allowance counts for nothing — that is what makes the raise
// temporary rather than a cap change with extra steps.
func TestAnExpiredResignAllowanceIsIgnored(t *testing.T) {
	log, ctx := testLog(t)
	log.LimitResigns(2)
	correlation := uniqueCorrelation(t)

	if err := log.Append(ctx, record(correlation, OutcomeAllowed, "500")); err != nil {
		t.Fatal(err)
	}
	if _, err := log.GrantResignAllowance(ctx, correlation, 5, "ops", "test", time.Now().Add(-time.Minute)); err != nil {
		t.Fatalf("granting an already-expired allowance: %v", err)
	}
	for i := 1; i <= 2; i++ {
		if err := log.Append(ctx, rebuilt(correlation, i)); err != nil {
			t.Fatalf("re-sign %d: %v", i, err)
		}
	}
	if err := log.Append(ctx, rebuilt(correlation, 3)); !errors.Is(err, ErrResignLimit) {
		t.Fatalf("re-sign past the cap with an expired allowance: err = %v, want ErrResignLimit", err)
	}

	// The expired row does not block a fresh grant.
	if _, err := log.GrantResignAllowance(ctx, correlation, 2, "ops", "test", time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("granting after expiry: %v", err)
	}
	if err := log.Append(ctx, rebuilt(correlation, 3)); err != nil {
		t.Fatalf("re-sign under the fresh allowance: %v", err)
	}
}

// One active grant per correlation: a second grant is refused rather than
// replaced, so the chain's history of grants is truthful.
func TestASecondActiveResignAllowanceIsRefused(t *testing.T) {
	log, ctx := testLog(t)
	correlation := uniqueCorrelation(t)

	if _, err := log.GrantResignAllowance(ctx, correlation, 1, "ops", "first", time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("first grant: %v", err)
	}
	if _, err := log.GrantResignAllowance(ctx, correlation, 5, "ops", "second", time.Now().Add(time.Hour)); !errors.Is(err, ErrAllowanceExists) {
		t.Fatalf("second grant: err = %v, want ErrAllowanceExists", err)
	}

	// The extra the cap honours is the first grant's, not the refused one's.
	if a, err := log.ResignAllowance(ctx, correlation); err != nil || a == nil || a.Extra != 1 {
		t.Fatalf("ResignAllowance = %+v, %v; want extra 1", a, err)
	}
}

// The grant is a row in the hash chain, and the chain still verifies with
// grant rows and re-signs mixed — an attacker who erases the allowance table
// (or a grant row) breaks the chain detectably.
func TestResignAllowanceGrantsAreChained(t *testing.T) {
	correlation := uniqueCorrelation(t)
	log, err := capAndExtra(t, correlation, 2)
	if err != nil {
		t.Fatalf("granting: %v", err)
	}

	// More evidence than the one grant: a re-sign under the allowance.
	if err := log.Append(context.Background(), rebuilt(correlation, 3)); err != nil {
		t.Fatal(err)
	}

	var grants int
	rows, err := log.db.Query(`SELECT method, caller, outcome FROM signatures WHERE method = '` + MethodResignAllowance + `'`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var method, caller, outcome string
		if err := rows.Scan(&method, &caller, &outcome); err != nil {
			t.Fatal(err)
		}
		if caller != "ops" || outcome != OutcomeAllowed {
			t.Fatalf("grant row: method=%s caller=%s outcome=%s", method, caller, outcome)
		}
		grants++
	}
	if grants == 0 {
		t.Fatal("no resign-allowance rows in the chain")
	}

	if intact, brokenAt, _, err := log.Verify(context.Background()); err != nil || !intact {
		t.Fatalf("chain broken at %s (err %v) after a grant and re-signs", brokenAt, err)
	}
}

// The extra column's bounds are the database's own constraint, not just the
// handler's validation — a grant of 0 or 11 fails the CHECK.
func TestResignAllowanceExtraIsBoundedByTheDatabase(t *testing.T) {
	log, ctx := testLog(t)
	for _, extra := range []int{0, 11} {
		if _, err := log.GrantResignAllowance(ctx, uniqueCorrelation(t), extra, "ops", "test", time.Now().Add(time.Hour)); err == nil {
			t.Fatalf("extra %d was accepted, want a CHECK constraint failure", extra)
		}
	}
}
