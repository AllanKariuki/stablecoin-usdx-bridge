package enforcement

// H6 sweep tests: each immediate FinalityStatus answer maps to exactly one
// durable outcome — FINAL and its outbox event, FAILED and its outbox event,
// or a reschedule. Against a real Postgres (the claim's FOR UPDATE SKIP
// LOCKED and the outbox's same-transaction guarantee live in the database),
// with the chain router faked.
//
//	docker compose up -d postgres
//	LEDGER_TEST_DATABASE_URL='postgres://bridge:bridge@localhost:55433/bridge_test?sslmode=disable' \
//	  go test ./internal/enforcement -count=1

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"sync"
	"testing"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/testdb"
)

type fakeFinalityChain struct {
	mu        sync.Mutex
	final     bool
	err       error
	statusFor map[string]bool // txHash -> final (optional per-hash scripting)
}

func (f *fakeFinalityChain) FinalityStatus(txHash string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.statusFor != nil {
		if final, ok := f.statusFor[txHash]; ok {
			return final, nil
		}
	}
	return f.final, f.err
}

func (f *fakeFinalityChain) IsPauseAuthority(context.Context) (bool, error) { return true, nil }
func (f *fakeFinalityChain) Blacklist(_, _ string) (string, error)          { return "", nil }
func (f *fakeFinalityChain) Unblacklist(_, _ string) (string, error)        { return "", nil }
func (f *fakeFinalityChain) Pause(_ string) (string, error)                 { return "", nil }
func (f *fakeFinalityChain) Unpause(_ string) (string, error)               { return "", nil }

func (f *fakeFinalityChain) BridgeMint(string, *big.Int, string) (string, error) { return "", nil }
func (f *fakeFinalityChain) BridgeBurn(string, *big.Int, string) (string, error) { return "", nil }
func (f *fakeFinalityChain) WaitForFinality(string, string) error                { return nil }
func (f *fakeFinalityChain) VerifyBurn(context.Context, string, string, *big.Int, string) error {
	return nil
}
func (f *fakeFinalityChain) ValidTxHash(hash string) bool { return len(hash) == 66 && hash[:2] == "0x" }

type sweepHarness struct {
	repo  *ledger.Repository
	chain *fakeFinalityChain
	sweep *Sweep
	ctx   context.Context
	ref   string
}

func newSweepHarness(t *testing.T) *sweepHarness {
	t.Helper()
	dsn := testdb.DSN(t, "LEDGER_TEST_DATABASE_URL")
	repo, err := ledger.NewRepository(dsn)
	if err != nil {
		t.Fatalf("connecting: %v", err)
	}
	chain := &fakeFinalityChain{}
	router := bridge.NewRouter(chain, chain)
	cfg := DefaultConfig()
	cfg.PollInterval = time.Millisecond
	cfg.Lease = 100 * time.Millisecond
	sweep := NewSweep(repo, router, slog.New(slog.NewTextHandler(io.Discard, nil)), cfg)

	return &sweepHarness{
		repo:  repo,
		chain: chain,
		sweep: sweep,
		ctx:   context.Background(),
		ref:   "swp-" + t.Name() + "-" + time.Now().UTC().Format("20060102150405.000000000"),
	}
}

// seed inserts a SUBMITTED row with a hash, due now.
func (h *sweepHarness) seed(t *testing.T, txHash string, attempts int) {
	t.Helper()
	if err := h.repo.CreateChainEnforcement(h.ctx, &ledger.ChainEnforcement{
		Reference:   h.ref,
		Action:      "BLACKLIST",
		Chain:       "ETHEREUM",
		Address:     "0x00000000000000000000000000000000000000E1",
		TxHash:      txHash,
		Status:      string(ledger.EnforcementSubmitted),
		Attempts:    attempts,
		NextCheckAt: time.Now().UTC().Add(-time.Minute),
	}); err != nil {
		t.Fatalf("seeding: %v", err)
	}
}

func (h *sweepHarness) row(t *testing.T) *ledger.ChainEnforcement {
	t.Helper()
	row, err := h.repo.ChainEnforcementByReference(h.ctx, h.ref)
	if err != nil {
		t.Fatalf("loading row: %v", err)
	}
	return row
}

// outboxEvent returns the finalized event for the row, or nil.
func (h *sweepHarness) outboxEvent(t *testing.T) map[string]any {
	t.Helper()
	db, err := sql.Open("pgx", testdb.DSN(t, "LEDGER_TEST_DATABASE_URL"))
	if err != nil {
		t.Fatalf("opening db: %v", err)
	}
	defer db.Close()
	var payload string
	err = db.QueryRow(`
		SELECT payload FROM outbox_events
		 WHERE event_type = 'damp.ledger.chain_enforcement_finalized.v1' AND aggregate_id = $1`,
		h.ref).Scan(&payload)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		t.Fatalf("outbox event: %v", err)
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(payload), &out); err != nil {
		t.Fatalf("decoding event payload: %v", err)
	}
	return out
}

func TestSweepFinalizesAndNotifies(t *testing.T) {
	h := newSweepHarness(t)
	h.seed(t, "0x"+fmt.Sprintf("%064d", 1), 0)
	h.chain.mu.Lock()
	h.chain.final = true
	h.chain.mu.Unlock()

	h.sweep.RunOnce(h.ctx)

	row := h.row(t)
	if row.Status != string(ledger.EnforcementFinal) {
		t.Fatalf("status = %s, want FINAL", row.Status)
	}
	event := h.outboxEvent(t)
	if event == nil {
		t.Fatalf("no finalized event was enqueued")
	}
	if event["status"] != "FINAL" || event["tx_hash"] != row.TxHash || event["reference"] != h.ref {
		t.Fatalf("event = %v", event)
	}
}

func TestSweepFailsAMinedRevertAndNotifies(t *testing.T) {
	h := newSweepHarness(t)
	h.seed(t, "0x"+fmt.Sprintf("%064d", 2), 0)
	h.chain.mu.Lock()
	h.chain.err = fmt.Errorf("tx 0x2 reverted: %w", bridge.ErrTxFailedOnChain)
	h.chain.mu.Unlock()

	h.sweep.RunOnce(h.ctx)

	row := h.row(t)
	if row.Status != string(ledger.EnforcementFailed) || row.FailureReason == "" {
		t.Fatalf("row = %+v, want FAILED with the chain's reason", row)
	}
	event := h.outboxEvent(t)
	if event == nil || event["status"] != "FAILED" || event["failure_reason"] != row.FailureReason {
		t.Fatalf("event = %v, want the FAILED event with the reason", event)
	}
}

func TestSweepReschedulesWhileNotFinal(t *testing.T) {
	h := newSweepHarness(t)
	h.seed(t, "0x"+fmt.Sprintf("%064d", 3), 0)
	h.chain.mu.Lock()
	h.chain.final = false
	h.chain.mu.Unlock()

	h.sweep.RunOnce(h.ctx)

	row := h.row(t)
	if row.Status != string(ledger.EnforcementSubmitted) {
		t.Fatalf("status = %s, want SUBMITTED (not final yet)", row.Status)
	}
	if row.Attempts != 1 {
		t.Fatalf("attempts = %d, want 1 (the claim counted)", row.Attempts)
	}
	if !row.NextCheckAt.After(time.Now().UTC()) {
		t.Fatalf("next_check_at = %v, want it pushed into the future", row.NextCheckAt)
	}
	if h.outboxEvent(t) != nil {
		t.Fatalf("a not-final row produced an event")
	}
}

func TestSweepFailsWhenTheBudgetIsSpent(t *testing.T) {
	h := newSweepHarness(t)
	h.seed(t, "0x"+fmt.Sprintf("%064d", 4), h.sweep.cfg.MaxAttempts)
	h.chain.mu.Lock()
	h.chain.final = false
	h.chain.mu.Unlock()

	h.sweep.RunOnce(h.ctx)

	row := h.row(t)
	if row.Status != string(ledger.EnforcementFailed) || row.FailureReason == "" {
		t.Fatalf("row = %+v, want FAILED with a finality-not-observed reason", row)
	}
	event := h.outboxEvent(t)
	if event == nil || event["status"] != "FAILED" {
		t.Fatalf("event = %v, want the FAILED event", event)
	}
}

func TestSweepFailsTransientErrorsWithinBudgetAreRescheduled(t *testing.T) {
	h := newSweepHarness(t)
	h.seed(t, "0x"+fmt.Sprintf("%064d", 5), 0)
	h.chain.mu.Lock()
	h.chain.err = context.DeadlineExceeded
	h.chain.mu.Unlock()

	h.sweep.RunOnce(h.ctx)

	row := h.row(t)
	if row.Status != string(ledger.EnforcementSubmitted) {
		t.Fatalf("status = %s, want SUBMITTED (transient, budget remains)", row.Status)
	}
	if h.outboxEvent(t) != nil {
		t.Fatalf("a transient failure produced an event")
	}
}
