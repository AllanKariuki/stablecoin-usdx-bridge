package ledger

import (
	"context"
	"encoding/json"
	"math/big"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/audit"
)

type auditRow struct {
	EventID string
	Action  string
	Status  string
	Payload string
}

type auditPayload struct {
	ID          string         `json:"id"`
	Actor       string         `json:"actor"`
	ActorRoles  []string       `json:"actor_roles"`
	Action      string         `json:"action"`
	SubjectType string         `json:"subject_type"`
	SubjectID   string         `json:"subject_id"`
	Service     string         `json:"service"`
	BeforeState map[string]any `json:"before_state"`
	AfterState  map[string]any `json:"after_state"`
	Metadata    map[string]any `json:"metadata"`
	RequestID   string         `json:"request_id"`
	SourceIP    string         `json:"source_ip"`
}

// auditFor reads the audit_outbox rows about one subject.
func auditFor(t *testing.T, repo *Repository, subjectID string) []auditPayload {
	t.Helper()
	var rows []auditRow
	err := repo.db.Raw(`
		SELECT event_id, action, status, payload::text AS payload FROM audit_outbox
		 WHERE payload->>'subject_id' = ? ORDER BY id`, subjectID).Scan(&rows).Error
	if err != nil {
		t.Fatalf("reading audit_outbox: %v", err)
	}
	out := make([]auditPayload, 0, len(rows))
	for _, r := range rows {
		var p auditPayload
		if err := json.Unmarshal([]byte(r.Payload), &p); err != nil {
			t.Fatalf("payload is not JSON: %v", err)
		}
		if p.ID != r.EventID || p.Action != r.Action || r.Status != "PENDING" {
			t.Fatalf("row/payload disagree: %+v vs %+v", r, p)
		}
		out = append(out, p)
	}
	return out
}

func requestCtx(ctx context.Context) context.Context {
	return audit.WithRequest(ctx, audit.Request{ID: "req-audit-1", SourceIP: "198.51.100.4", Roles: []string{"ops"}})
}

func TestIntegrationPostingWritesItsAuditEventInTheSameTransaction(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	ctx = requestCtx(ctx)
	user := uniqueUser(t)
	w, err := repo.EnsureWallet(ctx, user, "USD", "", "", "Main", "test")
	if err != nil {
		t.Fatal(err)
	}

	dep, err := svc.Deposit(ctx, DepositRequest{
		WalletID: w.ID, Amount: n(500_00), IdempotencyKey: key(t, "dep"), BankRef: "B-1", InitiatedBy: "ops-alice",
	})
	if err != nil {
		t.Fatalf("Deposit: %v", err)
	}

	events := auditFor(t, repo, dep.ID)
	if len(events) != 1 {
		t.Fatalf("%d audit events for the deposit, want 1", len(events))
	}
	e := events[0]
	if e.Actor != "ops-alice" || e.Action != AuditTransactionPosted || e.Service != "core-ledger" ||
		e.SubjectType != "TRANSACTION" || e.RequestID != "req-audit-1" || e.SourceIP != "198.51.100.4" ||
		len(e.ActorRoles) != 1 || e.ActorRoles[0] != "ops" {
		t.Fatalf("audit event = %+v", e)
	}
	if e.AfterState["type"] != string(TxFiatDeposit) || len(e.AfterState["entries"].([]any)) != 2 {
		t.Fatalf("after_state = %v", e.AfterState)
	}
	// Strings, not numbers: audit-trail hashes this, and a float64 through
	// JSONB is not the same bytes on the way back out.
	line := e.AfterState["entries"].([]any)[0].(map[string]any)
	if _, ok := line["amount"].(string); !ok {
		t.Fatalf("amount should be a decimal string, got %T", line["amount"])
	}

	// A retried request returns the original transaction and records nothing
	// new — the idempotency fast path never reaches the transaction.
	if _, err := svc.Deposit(ctx, DepositRequest{
		WalletID: w.ID, Amount: n(500_00), IdempotencyKey: dep.IdempotencyKey, BankRef: "B-1", InitiatedBy: "ops-alice",
	}); err != nil {
		t.Fatal(err)
	}
	if got := len(auditFor(t, repo, dep.ID)); got != 1 {
		t.Fatalf("idempotent replay produced %d audit events, want 1", got)
	}
}

func TestIntegrationARejectedPostingLeavesNoAuditEvent(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	w, err := repo.EnsureWallet(ctx, uniqueUser(t), "USD", "", "", "Main", "test")
	if err != nil {
		t.Fatal(err)
	}
	k := key(t, "overdraw")
	if _, err := svc.Withdraw(ctx, WithdrawRequest{
		WalletID: w.ID, Amount: n(1_00), IdempotencyKey: k, BankRef: "B-2", InitiatedBy: "ops-bob",
	}); err == nil {
		t.Fatal("withdrawing from an empty wallet should fail")
	}
	var count int64
	if err := repo.db.Raw(`SELECT count(*) FROM audit_outbox WHERE payload->'metadata'->>'idempotency_key' = ?`, k).
		Scan(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("a rolled-back posting left %d audit events behind", count)
	}
}

func TestIntegrationReversalIsAuditedAsAReversal(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	w, _ := repo.EnsureWallet(ctx, uniqueUser(t), "USD", "", "", "Main", "test")
	dep, err := svc.Deposit(ctx, DepositRequest{WalletID: w.ID, Amount: n(10_00), IdempotencyKey: key(t, "dep"), InitiatedBy: "ops-1"})
	if err != nil {
		t.Fatal(err)
	}
	rev, err := repo.Reverse(ctx, dep.ID, "posted in error", "ops-2", "")
	if err != nil {
		t.Fatal(err)
	}
	events := auditFor(t, repo, rev.ID)
	if len(events) != 1 || events[0].Action != AuditTransactionReversed || events[0].Actor != "ops-2" ||
		events[0].Metadata["reverses_tx_id"] != dep.ID {
		t.Fatalf("reversal audit = %+v", events)
	}
}

func TestIntegrationWalletStatusChangeIsAudited(t *testing.T) {
	repo, _, ctx := testRepo(t)
	w, _ := repo.EnsureWallet(ctx, uniqueUser(t), "USD", "", "", "Main", "test")
	if err := repo.SetWalletStatus(ctx, w.ID, WalletFrozen, "compliance-carol"); err != nil {
		t.Fatal(err)
	}
	events := auditFor(t, repo, w.ID)
	if len(events) != 2 || events[0].Action != AuditWalletCreated {
		t.Fatalf("%d audit events (%+v), want the creation and the status change", len(events), events)
	}
	e := events[1]
	if e.Action != AuditWalletStatusChanged || e.Actor != "compliance-carol" ||
		e.BeforeState["status"] != "ACTIVE" || e.AfterState["status"] != "FROZEN" {
		t.Fatalf("audit event = %+v", e)
	}

	// An invalid status is refused before the transaction: no event.
	_ = repo.SetWalletStatus(ctx, w.ID, WalletStatus("MELTED"), "compliance-carol")
	if got := len(auditFor(t, repo, w.ID)); got != 2 {
		t.Fatalf("refused status change was audited (%d events)", got)
	}
}

func TestIntegrationWalletCreationIsAuditedOnceWithItsCreator(t *testing.T) {
	repo, _, ctx := testRepo(t)
	ctx = requestCtx(ctx)
	user := uniqueUser(t)
	w, err := repo.EnsureWallet(ctx, user, "USD", "", "", "Main", "service:identity")
	if err != nil {
		t.Fatal(err)
	}
	// Ensuring it again returns the same wallet and creates nothing.
	if _, err := repo.EnsureWallet(ctx, user, "USD", "", "", "Main", "service:bff"); err != nil {
		t.Fatal(err)
	}
	events := auditFor(t, repo, w.ID)
	if len(events) != 1 {
		t.Fatalf("%d audit events, want 1", len(events))
	}
	e := events[0]
	if e.Action != AuditWalletCreated || e.Actor != "service:identity" || e.SubjectType != "WALLET" ||
		e.AfterState["user_id"] != user || e.AfterState["account_id"] != w.AccountID || e.RequestID != "req-audit-1" {
		t.Fatalf("audit event = %+v", e)
	}
}

// Concurrent first-time requests: one wallet, one audit event, and the
// losers' accounts rolled back rather than left orphaned in the trial
// balance.
func TestIntegrationConcurrentWalletCreationLeavesOneEventAndNoOrphans(t *testing.T) {
	repo, _, ctx := testRepo(t)
	user := uniqueUser(t)
	orphans := func() int64 {
		var n int64
		if err := repo.db.Raw(`
			SELECT count(*) FROM accounts a
			 WHERE a.gl_code LIKE ? AND NOT EXISTS (SELECT 1 FROM wallets w WHERE w.account_id = a.id)`,
			GLWalletParent("USD")+".%").Scan(&n).Error; err != nil {
			t.Fatal(err)
		}
		return n
	}
	// A delta, not zero: bridge_test is shared and outlives runs, and the
	// code before this fix left orphans behind.
	before := orphans()

	const n = 8
	ids := make(chan string, n)
	errs := make(chan error, n)
	for i := 0; i < n; i++ {
		go func() {
			w, err := repo.EnsureWallet(ctx, user, "USD", "", "", "Main", "test")
			if err != nil {
				errs <- err
				return
			}
			ids <- w.ID
		}()
	}
	var walletID string
	for i := 0; i < n; i++ {
		select {
		case err := <-errs:
			t.Fatalf("EnsureWallet: %v", err)
		case id := <-ids:
			if walletID != "" && id != walletID {
				t.Fatalf("two wallets for one user/currency: %s and %s", walletID, id)
			}
			walletID = id
		}
	}

	if got := len(auditFor(t, repo, walletID)); got != 1 {
		t.Fatalf("%d wallet.created events, want 1", got)
	}
	if after := orphans(); after != before {
		t.Fatalf("%d new wallet accounts with no wallet", after-before)
	}
}

func TestIntegrationReserveSnapshotsAreAuditedWithWhatTheyReplaced(t *testing.T) {
	repo, _, ctx := testRepo(t)
	height := uint64(time.Now().UnixNano())
	t.Cleanup(func() { repo.db.Exec(`DELETE FROM sol_supply_snapshot WHERE slot = ?`, height) })

	for _, supply := range []int64{100_000000, 90_000000} {
		if err := repo.SaveChainSupplySnapshot(ctx, ChainSupplySnapshot{
			Chain: "SOLANA", Height: height, TotalSupply: big.NewInt(supply), Source: "indexer", RecordedBy: "service:indexer",
		}); err != nil {
			t.Fatal(err)
		}
	}
	events := auditFor(t, repo, "SOLANA:"+strconv.FormatUint(height, 10))
	if len(events) != 2 || events[0].Action != AuditChainSupplyRecorded || events[0].Actor != "service:indexer" ||
		events[0].BeforeState != nil || events[1].BeforeState["total_supply"] != "100000000" ||
		events[1].AfterState["total_supply"] != "90000000" {
		t.Fatalf("chain supply audit = %+v", events)
	}

	custodian := "audit-" + uniqueUser(t)
	asOf := time.Now().UTC().Truncate(time.Microsecond)
	t.Cleanup(func() { repo.db.Exec(`DELETE FROM trust_bank_snapshot WHERE custodian_id = ?`, custodian) })
	if err := repo.SaveCustodianSnapshot(ctx, CustodianSnapshot{
		CustodianID: custodian, Currency: PegCurrency, AsOf: asOf, Balance: big.NewInt(5_00), Source: "stub", RecordedBy: "service:rms",
	}); err != nil {
		t.Fatal(err)
	}
	events = auditFor(t, repo, custodian+":"+PegCurrency+":"+asOf.Format(time.RFC3339Nano))
	if len(events) != 1 || events[0].Action != AuditCustodianRecorded || events[0].Actor != "service:rms" ||
		events[0].AfterState["balance"] != "500" {
		t.Fatalf("custodian snapshot audit = %+v", events)
	}

	// A refused snapshot writes neither the row nor the event.
	if err := repo.SaveCustodianSnapshot(ctx, CustodianSnapshot{
		CustodianID: custodian, Currency: "NOPE", AsOf: asOf, Balance: big.NewInt(1), RecordedBy: "service:rms",
	}); err == nil {
		t.Fatal("an unknown currency should be refused")
	}
	if got := len(auditFor(t, repo, custodian+":NOPE:"+asOf.Format(time.RFC3339Nano))); got != 0 {
		t.Fatalf("refused snapshot left %d audit events", got)
	}
}

func TestIntegrationPeriodCloseIsAudited(t *testing.T) {
	repo, _, ctx := testRepo(t)
	// Far in the past and an otherwise unused currency scope, so this closure
	// can't reject another test's postings.
	c, err := repo.ClosePeriod(ctx, "GBP", time.Date(2001, 1, 31, 0, 0, 0, 0, time.UTC), "test close", "controller-dan")
	if err != nil {
		t.Fatal(err)
	}
	events := auditFor(t, repo, c.ID)
	if len(events) != 1 || events[0].Action != AuditPeriodClosed || events[0].Actor != "controller-dan" ||
		events[0].AfterState["closing_date"] != "2001-01-31" {
		t.Fatalf("closure audit = %+v", events)
	}
}

func TestIntegrationDeadLetterResolutionIsAudited(t *testing.T) {
	repo, _, ctx := testRepo(t)
	corr := "audit-test-" + time.Now().UTC().Format("150405.000000000")
	bt, err := repo.UpsertTransfer(ctx, &BridgeTransfer{
		CorrelationID: corr, Kind: SagaMint, Amount: big.NewInt(1), TargetChain: "ETHEREUM",
		TargetAddress: "0x000000000000000000000000000000000000dEaD",
		// FAILED, not PENDING: resolution then has nothing to re-arm, and no
		// worker that ever points at bridge_test can pick it up.
		Status: StatusFailed, UserID: uniqueUser(t),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := repo.DeadLetter(ctx, bt, "mint", "test"); err != nil {
		t.Fatal(err)
	}
	if err := repo.ResolveDeadLetter(ctx, corr, "ops-erin", "refunded off-platform"); err != nil {
		t.Fatal(err)
	}
	events := auditFor(t, repo, corr)
	if len(events) != 1 || events[0].Action != AuditDeadLetterResolved || events[0].Actor != "ops-erin" ||
		events[0].AfterState["saga_requeued"] != false || events[0].Metadata["resolution"] != "refunded off-platform" {
		t.Fatalf("resolution audit = %+v", events)
	}
}

// The migration is audit.Schema copied into goose's format. If the two drift,
// the shared relay is running against a table it did not define.
func TestAuditOutboxMigrationMatchesTheSharedSchema(t *testing.T) {
	raw, err := migrationsFS.ReadFile("migrations/00007_audit_outbox.sql")
	if err != nil {
		t.Fatal(err)
	}
	up := strings.SplitN(string(raw), "-- +goose Down", 2)[0]
	if normaliseSQL(up) != normaliseSQL(audit.Schema) {
		t.Fatalf("migrations/00007_audit_outbox.sql has drifted from audit.Schema:\n%s\nvs\n%s",
			normaliseSQL(up), normaliseSQL(audit.Schema))
	}
}

var sqlComment = regexp.MustCompile(`--[^\n]*`)
var whitespace = regexp.MustCompile(`\s+`)

func normaliseSQL(s string) string {
	return strings.TrimSpace(whitespace.ReplaceAllString(sqlComment.ReplaceAllString(s, ""), " "))
}
