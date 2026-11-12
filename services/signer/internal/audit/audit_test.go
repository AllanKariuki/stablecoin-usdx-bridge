package audit

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"os"
	"sync"
	"testing"
	"time"
)

// These run against real Postgres, because the properties worth doubting are
// all database properties: the append-only trigger, the partial unique index
// behind idempotency, and the SERIALIZABLE read-then-insert that keeps the
// hash chain from forking under concurrency. A fake would confirm the Go code
// and none of them.
//
//	SIGNER_TEST_DATABASE_URL='postgres://signer:signer@localhost:55433/signer_test?sslmode=disable' \
//	  go test ./services/signer/internal/audit/
func testLog(t *testing.T) (*Log, context.Context) {
	t.Helper()
	dsn := os.Getenv("SIGNER_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set SIGNER_TEST_DATABASE_URL to run signer audit tests")
	}
	log, err := Open(dsn)
	if err != nil {
		t.Fatalf("opening the audit log: %v", err)
	}
	t.Cleanup(func() { _ = log.Close() })
	return log, context.Background()
}

// A distinct correlation id per run, so repeated runs of this suite don't
// collide on the idempotency index — and so the chain can be appended to
// rather than truncated, which the trigger would refuse anyway.
func uniqueCorrelation(t *testing.T) string {
	t.Helper()
	return t.Name() + "-" + time.Now().UTC().Format("20060102150405.000000000")
}

func record(correlationID, outcome string, amount string) *Record {
	return &Record{
		Chain:         "ETHEREUM",
		Method:        "bridgeMint",
		KeyID:         "eth-relayer",
		Backend:       "local",
		Caller:        "core-ledger-worker",
		Amount:        amount,
		Destination:   "0xabc",
		CorrelationID: correlationID,
		Digest:        "deadbeef",
		PayloadDigest: "payload-" + amount,
		Signature:     "cafebabe",
		Outcome:       outcome,
		Reason:        "test",
	}
}

func TestAppendLinksEachRecordToItsPredecessor(t *testing.T) {
	log, ctx := testLog(t)

	first := record(uniqueCorrelation(t)+"-a", OutcomeAllowed, "1000")
	if err := log.Append(ctx, first); err != nil {
		t.Fatalf("appending: %v", err)
	}
	second := record(uniqueCorrelation(t)+"-b", OutcomeAllowed, "2000")
	if err := log.Append(ctx, second); err != nil {
		t.Fatalf("appending: %v", err)
	}

	if second.PrevHash != first.Hash {
		t.Fatalf("the second record's prev_hash is %s, not the first's hash %s", second.PrevHash, first.Hash)
	}
	if first.Hash == second.Hash {
		t.Fatal("two different records produced the same hash")
	}
}

// The whole point of the chain. An auditor must be able to establish that
// nothing was removed, without trusting the process that wrote the rows.
func TestVerifyAcceptsAnUntouchedChain(t *testing.T) {
	log, ctx := testLog(t)

	for i := 0; i < 3; i++ {
		if err := log.Append(ctx, record(uniqueCorrelation(t)+string(rune('a'+i)), OutcomeAllowed, "10")); err != nil {
			t.Fatalf("appending: %v", err)
		}
	}

	intact, brokenAt, checked, err := log.Verify(ctx)
	if err != nil {
		t.Fatalf("verifying: %v", err)
	}
	if !intact {
		t.Fatalf("an untouched chain verified as broken at %s (after %d records)", brokenAt, checked)
	}
	if checked < 3 {
		t.Fatalf("verify walked %d records, expected at least the 3 just written", checked)
	}
}

// The plan's *"idempotent on (chain, method, correlation_id) — a retried mint
// returns the original tx hash"*. Without it, a saga retry after a timeout
// produces a second valid signature for the same movement.
func TestASecondAllowedSignatureForOneCorrelationIsRefused(t *testing.T) {
	log, ctx := testLog(t)
	correlation := uniqueCorrelation(t)

	if err := log.Append(ctx, record(correlation, OutcomeAllowed, "500")); err != nil {
		t.Fatalf("first append: %v", err)
	}

	err := log.Append(ctx, record(correlation, OutcomeAllowed, "500"))
	if !errors.Is(err, ErrAlreadySigned) {
		t.Fatalf("err = %v, want ErrAlreadySigned", err)
	}
}

// A denial must not consume the idempotency slot: a request refused for being
// over a ceiling has to be retryable once the ceiling is raised.
func TestADenialDoesNotConsumeTheCorrelation(t *testing.T) {
	log, ctx := testLog(t)
	correlation := uniqueCorrelation(t)

	if err := log.Append(ctx, record(correlation, OutcomeDenied, "999999")); err != nil {
		t.Fatalf("appending a denial: %v", err)
	}
	if err := log.Append(ctx, record(correlation, OutcomeAllowed, "500")); err != nil {
		t.Fatalf("a retry after a denial was refused: %v", err)
	}
}

func TestExistingReturnsThePreviousAllowedSignature(t *testing.T) {
	log, ctx := testLog(t)
	correlation := uniqueCorrelation(t)

	original := record(correlation, OutcomeAllowed, "750")
	if err := log.Append(ctx, original); err != nil {
		t.Fatalf("appending: %v", err)
	}

	found, err := log.Existing(ctx, "ETHEREUM", "bridgeMint", correlation, "deadbeef")
	if err != nil {
		t.Fatalf("looking up: %v", err)
	}
	if found == nil {
		t.Fatal("a previously-signed correlation was not found")
	}
	if found.Signature != original.Signature || found.ID != original.ID {
		t.Fatal("Existing returned a different record than the one appended")
	}
}

func TestExistingIgnoresDenials(t *testing.T) {
	log, ctx := testLog(t)
	correlation := uniqueCorrelation(t)

	if err := log.Append(ctx, record(correlation, OutcomeDenied, "1")); err != nil {
		t.Fatalf("appending: %v", err)
	}
	found, err := log.Existing(ctx, "ETHEREUM", "bridgeMint", correlation, "deadbeef")
	if err != nil {
		t.Fatalf("looking up: %v", err)
	}
	if found != nil {
		t.Fatal("a denied request was returned as an existing signature")
	}
}

// The database refuses edits and deletes, not the code. The value of an audit
// log is exactly the confidence that nothing has been taken out of it.
func TestTheLogIsAppendOnlyAtTheDatabaseLevel(t *testing.T) {
	log, ctx := testLog(t)

	r := record(uniqueCorrelation(t), OutcomeAllowed, "10")
	if err := log.Append(ctx, r); err != nil {
		t.Fatalf("appending: %v", err)
	}

	if _, err := log.db.ExecContext(ctx, `UPDATE signatures SET amount = '0' WHERE id = $1`, r.ID); err == nil {
		t.Fatal("a signature record was successfully updated")
	}
	if _, err := log.db.ExecContext(ctx, `DELETE FROM signatures WHERE id = $1`, r.ID); err == nil {
		t.Fatal("a signature record was successfully deleted")
	}
}

func TestDailyTotalSumsOnlyAllowedSignatures(t *testing.T) {
	log, ctx := testLog(t)

	before, err := log.DailyTotal(ctx, "SOLANA", "bridgeBurn", "")
	if err != nil {
		t.Fatalf("reading the daily total: %v", err)
	}

	allowed := record(uniqueCorrelation(t)+"-ok", OutcomeAllowed, "300")
	allowed.Chain, allowed.Method = "SOLANA", "bridgeBurn"
	if err := log.Append(ctx, allowed); err != nil {
		t.Fatalf("appending: %v", err)
	}

	// A denial must not count towards the limit — otherwise a caller could
	// exhaust somebody else's daily budget purely by being refused.
	denied := record(uniqueCorrelation(t)+"-no", OutcomeDenied, "9000")
	denied.Chain, denied.Method = "SOLANA", "bridgeBurn"
	if err := log.Append(ctx, denied); err != nil {
		t.Fatalf("appending: %v", err)
	}

	after, err := log.DailyTotal(ctx, "SOLANA", "bridgeBurn", "")
	if err != nil {
		t.Fatalf("reading the daily total: %v", err)
	}
	if diff := new(big.Int).Sub(after, before); diff.String() != "300" {
		t.Fatalf("the daily total moved by %s, want 300 (the denial must not count)", diff)
	}
}

// ---- payload binding (00002) ----------------------------------------------

// A rebuilt transaction for the same payload — a retry with a new nonce, gas
// price or blockhash — may be signed again. Without this, a signed attempt
// that never landed left its saga unable to get a signature for the next.
func TestTheSamePayloadMayBeReSignedAsNewBytes(t *testing.T) {
	log, ctx := testLog(t)
	correlation := uniqueCorrelation(t)

	first := record(correlation, OutcomeAllowed, "500")
	if err := log.Append(ctx, first); err != nil {
		t.Fatalf("first append: %v", err)
	}
	rebuilt := record(correlation, OutcomeAllowed, "500")
	rebuilt.Digest, rebuilt.Signature = "feedface", "0badf00d"
	if err := log.Append(ctx, rebuilt); err != nil {
		t.Fatalf("a re-sign of the same payload was refused: %v", err)
	}

	// Existing prefers the record over exactly these bytes, so a replay of
	// either transaction returns its own signature.
	found, err := log.Existing(ctx, "ETHEREUM", "bridgeMint", correlation, "feedface")
	if err != nil || found == nil || found.ID != rebuilt.ID {
		t.Fatalf("Existing(feedface) = %+v, %v; want the rebuilt record", found, err)
	}
	found, err = log.Existing(ctx, "ETHEREUM", "bridgeMint", correlation, "deadbeef")
	if err != nil || found == nil || found.ID != first.ID {
		t.Fatalf("Existing(deadbeef) = %+v, %v; want the first record", found, err)
	}
	if found.PayloadDigest != first.PayloadDigest {
		t.Fatalf("payload digest read back as %q, want %q", found.PayloadDigest, first.PayloadDigest)
	}
}

// One correlation id, one payload. This is the database-side half of the
// handler's 409: two replicas can both pass the Existing check concurrently,
// and only the append can have the last word.
func TestADifferentPayloadUnderOneCorrelationIsRefused(t *testing.T) {
	log, ctx := testLog(t)
	correlation := uniqueCorrelation(t)

	if err := log.Append(ctx, record(correlation, OutcomeAllowed, "500")); err != nil {
		t.Fatalf("first append: %v", err)
	}
	bigger := record(correlation, OutcomeAllowed, "500000")
	bigger.Digest = "0ddba11"
	if err := log.Append(ctx, bigger); !errors.Is(err, ErrPayloadMismatch) {
		t.Fatalf("err = %v, want ErrPayloadMismatch", err)
	}

	// A denial records a refusal, not a binding, and is still written.
	if err := log.Append(ctx, record(correlation, OutcomeDenied, "500000")); err != nil {
		t.Fatalf("recording the denial: %v", err)
	}
}

// The race the in-transaction check exists for: replicas binding one
// correlation id to different payloads at the same moment. However the
// losers fail — ErrPayloadMismatch, or a serialization failure — at most one
// payload may end up bound.
func TestConcurrentAppendsBindAtMostOnePayload(t *testing.T) {
	log, ctx := testLog(t)
	correlation := uniqueCorrelation(t)

	const n = 8
	var wg sync.WaitGroup
	errs := make([]error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			r := record(correlation, OutcomeAllowed, fmt.Sprint(100+i))
			r.Digest = fmt.Sprintf("d%02d", i)
			errs[i] = log.Append(ctx, r)
		}(i)
	}
	wg.Wait()

	var bound int
	if err := log.db.QueryRowContext(ctx, `
		SELECT count(DISTINCT payload_digest) FROM signatures
		 WHERE correlation_id = $1 AND outcome = 'ALLOWED'`, correlation).Scan(&bound); err != nil {
		t.Fatal(err)
	}
	if bound > 1 {
		t.Fatalf("%d different payloads were bound to one correlation id (append errors: %v)", bound, errs)
	}
}

// A row from before 00002 has no payload digest: nothing records what it
// authorised beyond its bytes, so only those bytes may follow it.
func TestALegacyRecordBindsItsCorrelationToItsBytes(t *testing.T) {
	log, ctx := testLog(t)
	correlation := uniqueCorrelation(t)

	legacy := record(correlation, OutcomeAllowed, "500")
	legacy.PayloadDigest = ""
	if err := log.Append(ctx, legacy); err != nil {
		t.Fatalf("appending: %v", err)
	}

	if err := log.Append(ctx, record(correlation, OutcomeAllowed, "500")); !errors.Is(err, ErrAlreadySigned) {
		t.Fatalf("same bytes after a legacy row: err = %v, want ErrAlreadySigned", err)
	}
	rebuilt := record(correlation, OutcomeAllowed, "500")
	rebuilt.Digest = "feedface"
	if err := log.Append(ctx, rebuilt); !errors.Is(err, ErrPayloadMismatch) {
		t.Fatalf("new bytes after a legacy row: err = %v, want ErrPayloadMismatch", err)
	}

	// The chain still verifies with legacy-shaped and new rows mixed: an
	// empty payload digest must hash exactly as it did before 00002.
	if intact, brokenAt, _, err := log.Verify(ctx); err != nil || !intact {
		t.Fatalf("chain broken at %s (err %v) after mixing legacy and new rows", brokenAt, err)
	}
}

// A re-sign authorises the same money, not more of it.
func TestDailyTotalCountsACorrelationOnceAndCanExcludeIt(t *testing.T) {
	log, ctx := testLog(t)
	const chain, method = "SOLANA", "bridgeMint"
	correlation := uniqueCorrelation(t)

	before, err := log.DailyTotal(ctx, chain, method, "")
	if err != nil {
		t.Fatal(err)
	}
	for i, digest := range []string{"aa01", "aa02", "aa03"} {
		r := record(correlation, OutcomeAllowed, "700")
		r.Chain, r.Method, r.Digest = chain, method, digest
		if err := log.Append(ctx, r); err != nil {
			t.Fatalf("append %d: %v", i, err)
		}
	}

	after, err := log.DailyTotal(ctx, chain, method, "")
	if err != nil {
		t.Fatal(err)
	}
	if diff := new(big.Int).Sub(after, before); diff.String() != "700" {
		t.Fatalf("three signatures of one payload moved the total by %s, want 700", diff)
	}

	excluded, err := log.DailyTotal(ctx, chain, method, correlation)
	if err != nil {
		t.Fatal(err)
	}
	if excluded.Cmp(before) != 0 {
		t.Fatalf("excluding the correlation gave %s, want the total before it (%s)", excluded, before)
	}
}
