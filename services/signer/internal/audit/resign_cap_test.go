package audit

import (
	"errors"
	"fmt"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

// ---- re-sign cap ------------------------------------------------------------

// rebuilt is a re-sign of record's payload: same everything, new bytes.
func rebuilt(correlationID string, n int) *Record {
	r := record(correlationID, OutcomeAllowed, "500")
	r.Digest = fmt.Sprintf("rebuilt-%02d", n)
	r.Signature = fmt.Sprintf("sig-%02d", n)
	return r
}

func allowedCount(t *testing.T, log *Log, correlationID string) int {
	t.Helper()
	var n int
	if err := log.db.QueryRow(`
		SELECT count(*) FROM signatures WHERE correlation_id = $1 AND outcome = 'ALLOWED'`,
		correlationID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// The cap is the first signature plus N re-signs. What it must not catch:
// exact bytes (a replay authorises nothing new), denials (they bind nothing),
// and other correlation ids.
func TestResignsAreCappedPerCorrelation(t *testing.T) {
	log, ctx := testLog(t)
	log.LimitResigns(2)
	correlation := uniqueCorrelation(t)

	first := record(correlation, OutcomeAllowed, "500")
	if err := log.Append(ctx, first); err != nil {
		t.Fatalf("first append: %v", err)
	}
	for i := 1; i <= 2; i++ {
		if ok, err := log.ResignAllowed(ctx, "ETHEREUM", "bridgeMint", correlation); err != nil || !ok {
			t.Fatalf("ResignAllowed before re-sign %d = %v, %v; want true", i, ok, err)
		}
		if err := log.Append(ctx, rebuilt(correlation, i)); err != nil {
			t.Fatalf("re-sign %d within the cap: %v", i, err)
		}
	}

	if ok, err := log.ResignAllowed(ctx, "ETHEREUM", "bridgeMint", correlation); err != nil || ok {
		t.Fatalf("ResignAllowed at the cap = %v, %v; want false", ok, err)
	}
	if err := log.Append(ctx, rebuilt(correlation, 3)); !errors.Is(err, ErrResignLimit) {
		t.Fatalf("re-sign past the cap: err = %v, want ErrResignLimit", err)
	}
	if err := log.Append(ctx, record(correlation, OutcomeAllowed, "500")); !errors.Is(err, ErrAlreadySigned) {
		t.Fatalf("exact bytes past the cap: err = %v, want ErrAlreadySigned", err)
	}
	if err := log.Append(ctx, record(correlation, OutcomeDenied, "500")); err != nil {
		t.Fatalf("recording a denial past the cap: %v", err)
	}
	if err := log.Append(ctx, rebuilt(uniqueCorrelation(t)+"-other", 1)); err != nil {
		t.Fatalf("an unrelated correlation was capped: %v", err)
	}
	if got := allowedCount(t, log, correlation); got != 3 {
		t.Fatalf("%d signatures recorded, want 3 (first + 2 re-signs)", got)
	}
	if intact, brokenAt, _, err := log.Verify(ctx); err != nil || !intact {
		t.Fatalf("chain broken at %s (err %v)", brokenAt, err)
	}
}

// The race the in-transaction count exists for: replicas re-signing one
// payload at the same moment, each having seen room for one more. However
// the losers fail — ErrResignLimit, or a serialization failure the handler
// turns into a withheld signature — the cap holds. Then, filled sequentially,
// it lands exactly on the cap: the race costs slots, never adds them.
func TestConcurrentResignsNeverExceedTheCap(t *testing.T) {
	log, ctx := testLog(t)
	log.LimitResigns(2)
	correlation := uniqueCorrelation(t)

	if err := log.Append(ctx, record(correlation, OutcomeAllowed, "500")); err != nil {
		t.Fatalf("first append: %v", err)
	}

	const n = 12
	var wg sync.WaitGroup
	errs := make([]error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			errs[i] = log.Append(ctx, rebuilt(correlation, i))
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil && !errors.Is(err, ErrResignLimit) && !isSerializationFailure(err) {
			t.Fatalf("append %d failed unexpectedly: %v", i, err)
		}
	}
	if got := allowedCount(t, log, correlation); got > 3 {
		t.Fatalf("%d signatures recorded under a cap of first + 2 (errors: %v)", got, errs)
	}

	for i := n; ; i++ {
		err := log.Append(ctx, rebuilt(correlation, i))
		if errors.Is(err, ErrResignLimit) {
			break
		}
		if err != nil {
			t.Fatalf("sequential re-sign %d: %v", i, err)
		}
		if i > n+3 {
			t.Fatal("the cap never refused")
		}
	}
	if got := allowedCount(t, log, correlation); got != 3 {
		t.Fatalf("%d signatures recorded, want exactly 3", got)
	}
	if intact, brokenAt, _, err := log.Verify(ctx); err != nil || !intact {
		t.Fatalf("chain broken at %s (err %v) after concurrent appends", brokenAt, err)
	}
}

func isSerializationFailure(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "40001"
}
