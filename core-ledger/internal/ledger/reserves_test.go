package ledger

import (
	"errors"
	"math/big"
	"testing"
	"time"
)

// The reserve tables are the inputs reconciliation compares. Every one of them
// existed since migration 00001 with no writer at all, which is why these are
// integration tests against real Postgres rather than unit tests against a
// fake: the things worth doubting are the composite primary key that lets two
// custodians coexist, the partial unique index that makes a break one row
// rather than one per run, and the DISTINCT ON that stops a chatty custodian
// masking a silent one.

func TestIntegrationChainSupplySnapshots(t *testing.T) {
	repo, _, ctx := testRepo(t)

	// A monotonic height, not a random or wrapped one: LatestChainSupply
	// answers "the highest height recorded", so a run that happened to pick a
	// lower number than a previous run's would read that run's snapshot back
	// and fail for a reason that has nothing to do with the code.
	base := uint64(time.Now().UnixMilli())

	// And cleaned up afterwards, because these rows are what `make reconcile`
	// reads: leaving a fabricated 240 USD-X supply behind would make Leg A
	// report a drift on a developer's next local run.
	t.Cleanup(func() {
		repo.db.Exec(`DELETE FROM eth_supply_snapshot WHERE block_number = ?`, base)
		repo.db.Exec(`DELETE FROM sol_supply_snapshot WHERE slot = ?`, base)
	})

	for _, chain := range []string{"ETHEREUM", "SOLANA"} {
		err := repo.SaveChainSupplySnapshot(ctx, ChainSupplySnapshot{
			Chain: chain, Height: base, BlockHash: "0xaaa",
			TotalSupply: big.NewInt(250_000000), Source: "indexer",
		})
		if err != nil {
			t.Fatalf("SaveChainSupplySnapshot(%s): %v", chain, err)
		}

		supply, height, _, err := repo.LatestChainSupply(ctx, chain)
		if err != nil {
			t.Fatalf("LatestChainSupply(%s): %v", chain, err)
		}
		if supply.String() != "250000000" || height != base {
			t.Fatalf("%s: got supply=%s height=%d, want 250000000 at %d", chain, supply, height, base)
		}
	}

	// A reorg makes the indexer re-read a height it already wrote, with a
	// different hash and possibly a different supply. Overwriting is correct:
	// the later read is at worst equally true and at best a correction.
	err := repo.SaveChainSupplySnapshot(ctx, ChainSupplySnapshot{
		Chain: "ETHEREUM", Height: base, BlockHash: "0xbbb",
		TotalSupply: big.NewInt(240_000000), Source: "indexer",
	})
	if err != nil {
		t.Fatalf("re-posting the same height: %v", err)
	}
	supply, _, _, err := repo.LatestChainSupply(ctx, "ETHEREUM")
	if err != nil {
		t.Fatalf("LatestChainSupply after correction: %v", err)
	}
	if supply.String() != "240000000" {
		t.Fatalf("supply after a corrected block = %s, want 240000000", supply)
	}

	// A chain this ledger doesn't track must be refused rather than silently
	// dropped: an indexer misconfigured with the wrong chain name would
	// otherwise report success forever while Leg A compared against nothing.
	if err := repo.SaveChainSupplySnapshot(ctx, ChainSupplySnapshot{
		Chain: "POLYGON", Height: base, TotalSupply: big.NewInt(1),
	}); err == nil {
		t.Fatal("an unknown chain was accepted")
	}
}

func TestIntegrationCustodianBalanceSumsEachCustodiansLatest(t *testing.T) {
	repo, _, ctx := testRepo(t)

	// EUR is seeded by DefaultCurrencies and no other test posts a custodian
	// snapshot against it, so it belongs to this one.
	//
	// The wipe is necessary rather than tidy: CustodianBalance's contract is
	// "sum every custodian holding this currency", so snapshots left by a
	// *previous run of this same test* are summed too and the assertion drifts
	// upward every time the suite is run. Unique custodian ids per run don't
	// help — that is precisely what makes each run's leftovers look like yet
	// another custodian. Deleting is safe here in a way it would never be for
	// the journal: a snapshot is an observation, not a posting, and nothing
	// derives from it once a newer one exists.
	const ccy = "EUR"
	if err := repo.db.Exec(`DELETE FROM trust_bank_snapshot WHERE currency = ?`, ccy).Error; err != nil {
		t.Fatalf("clearing previous runs' EUR snapshots: %v", err)
	}
	now := time.Now().UTC().Truncate(time.Microsecond)
	nameA := "custodian-a-" + now.Format("150405.000000000")
	nameB := "custodian-b-" + now.Format("150405.000000000")

	save := func(id string, at time.Time, balance int64) {
		t.Helper()
		err := repo.SaveCustodianSnapshot(ctx, CustodianSnapshot{
			CustodianID: id, Currency: ccy, AsOf: at,
			Balance: big.NewInt(balance), Source: "rms",
		})
		if err != nil {
			t.Fatalf("SaveCustodianSnapshot(%s): %v", id, err)
		}
	}

	// A reports twice; B once and earlier. Taking "the latest row overall"
	// would return only A's 60000 and silently drop B entirely — which is
	// exactly how a second custodian goes missing from the peg.
	save(nameA, now.Add(-2*time.Hour), 50_000)
	save(nameA, now, 60_000)
	save(nameB, now.Add(-3*time.Hour), 40_000)

	total, asOf, err := repo.CustodianBalance(ctx, ccy)
	if err != nil {
		t.Fatalf("CustodianBalance: %v", err)
	}
	if total.String() != "100000" {
		t.Fatalf("total = %s, want 100000 (A's latest 60000 + B's 40000)", total)
	}

	// The total is only as fresh as its stalest part. Reporting A's timestamp
	// would make a custodian that stopped reporting three hours ago look
	// current.
	if !asOf.Equal(now.Add(-3 * time.Hour)) {
		t.Fatalf("as_of = %s, want the oldest contributing snapshot %s", asOf, now.Add(-3*time.Hour))
	}
}

func TestIntegrationCustodianBalanceWithNoSnapshots(t *testing.T) {
	repo, _, ctx := testRepo(t)

	// KES is seeded and no test posts a custodian snapshot for it. The
	// distinction being asserted is the one Leg C depends on: "nobody has
	// told us" must be a named error, not a zero balance, because a zero
	// would render as a total shortfall on a perfectly healthy platform.
	_, _, err := repo.CustodianBalance(ctx, "KES")
	if !errors.Is(err, ErrNoTrustBankSnapshot) {
		t.Fatalf("err = %v, want ErrNoTrustBankSnapshot", err)
	}
}

func TestIntegrationBreakIsOneRowAcrossManyRuns(t *testing.T) {
	repo, _, ctx := testRepo(t)

	// A code unique to this run, so the partial unique index this asserts on
	// isn't shared with another test's open break.
	code := "TEST_DRIFT_" + time.Now().UTC().Format("150405.000000000")

	newRun := func() *ReconciliationRun {
		t.Helper()
		run := &ReconciliationRun{Status: RunBreaks, TriggeredBy: "test"}
		if err := repo.SaveReconciliationRun(ctx, run); err != nil {
			t.Fatalf("SaveReconciliationRun: %v", err)
		}
		return run
	}

	first := newRun()
	b := &ReconciliationBreak{
		Leg: LegNameForTest, Code: code, Detail: "drift=-1000",
		OpenedRunID: first.ID, LastRunID: first.ID, Drift: big.NewInt(-1000),
	}
	opened, err := repo.OpenOrUpdateBreak(ctx, b)
	if err != nil {
		t.Fatalf("OpenOrUpdateBreak: %v", err)
	}
	if !opened {
		t.Fatal("the first observation of a condition did not open a break")
	}
	firstID := b.ID

	// Three more runs see the same condition. Each must update the existing
	// row rather than open a new one — otherwise "open breaks" is a count of
	// reconciliation runs, not a work queue, and alerting once per break
	// becomes alerting every five minutes forever.
	for i := 0; i < 3; i++ {
		run := newRun()
		again := &ReconciliationBreak{
			Leg: LegNameForTest, Code: code, Detail: "drift=-1200",
			OpenedRunID: run.ID, LastRunID: run.ID, Drift: big.NewInt(-1200),
		}
		opened, err := repo.OpenOrUpdateBreak(ctx, again)
		if err != nil {
			t.Fatalf("OpenOrUpdateBreak (repeat %d): %v", i, err)
		}
		if opened {
			t.Fatalf("observation %d opened a second break for the same condition", i+2)
		}
		if again.ID != firstID {
			t.Fatalf("repeat observation got id %s, want the original %s", again.ID, firstID)
		}
	}

	open, err := repo.OpenBreaks(ctx)
	if err != nil {
		t.Fatalf("OpenBreaks: %v", err)
	}
	var found *ReconciliationBreak
	for i := range open {
		if open[i].Code == code {
			found = &open[i]
		}
	}
	if found == nil {
		t.Fatal("the break is not in the open list")
	}
	if found.Observations != 4 {
		t.Fatalf("observations = %d, want 4", found.Observations)
	}
	// first_drift is preserved and drift moves: "it started at -1000 and is
	// now -1200" is the difference between a bookkeeping error and a leak.
	if found.FirstDrift.String() != "-1000" || found.Drift.String() != "-1200" {
		t.Fatalf("first_drift=%s drift=%s, want -1000 and -1200", found.FirstDrift, found.Drift)
	}

	// The world stops being that way. The break must close without anyone
	// clicking anything — and the run that closed it is recorded, so the
	// resolution is as auditable as the opening.
	healthy := newRun()
	resolved, err := repo.ResolveBreaks(ctx, healthy.ID, map[string]bool{})
	if err != nil {
		t.Fatalf("ResolveBreaks: %v", err)
	}
	var sawOurs bool
	for _, r := range resolved {
		if r.Code == code {
			sawOurs = true
			if r.ResolvedRunID == nil || *r.ResolvedRunID != healthy.ID {
				t.Fatalf("resolved_run_id = %v, want %s", r.ResolvedRunID, healthy.ID)
			}
		}
	}
	if !sawOurs {
		t.Fatal("a break the run no longer observed was not auto-resolved")
	}

	// And the same condition recurring opens a *new* break rather than
	// reviving the resolved one — the partial index only constrains open rows
	// precisely so this is possible.
	third := newRun()
	recurrence := &ReconciliationBreak{
		Leg: LegNameForTest, Code: code, Detail: "drift=-500",
		OpenedRunID: third.ID, LastRunID: third.ID, Drift: big.NewInt(-500),
	}
	opened, err = repo.OpenOrUpdateBreak(ctx, recurrence)
	if err != nil {
		t.Fatalf("OpenOrUpdateBreak (recurrence): %v", err)
	}
	if !opened || recurrence.ID == firstID {
		t.Fatal("a condition recurring after resolution reopened the old row instead of opening a new break")
	}
}

// LegNameForTest keeps these rows out of the three real legs' namespace, so a
// test run never leaves something that looks like a genuine open break on a
// developer's dashboard.
const LegNameForTest = "LEG_TEST"
