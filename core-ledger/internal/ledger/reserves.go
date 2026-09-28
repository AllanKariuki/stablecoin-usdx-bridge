package ledger

import (
	"context"
	"errors"

	"math/big"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/outbox"

	"github.com/google/uuid"
	"gorm.io/gorm/clause"
)

// ---------------------------------------------------------------------------
// Reserve snapshots
//
// The three snapshot tables have existed since migration 00001 with no writer
// between them. These are the writers: services/indexer posts chain supply,
// services/rms posts what the custodian says. Both go through core-ledger
// rather than writing the tables directly, because the ledger is the only
// place value exists (docs/building-plan.md, "Target architecture") and a
// second process with INSERT rights on a reconciliation input is a second
// place the peg can be lied to from.
// ---------------------------------------------------------------------------

// ChainSupplySnapshot is the chain-agnostic shape the API accepts. It fans out
// to eth_supply_snapshot or sol_supply_snapshot, which stay separate tables
// because their height is a different thing — an Ethereum block number and a
// Solana slot are not comparable and must not share a column.
type ChainSupplySnapshot struct {
	Chain       string
	Height      uint64
	BlockHash   string
	TotalSupply *big.Int
	Source      string
	CapturedAt  time.Time
}

// CustodianSnapshot is a statement balance as of a point in time. It is
// deliberately not an update of a single "current balance" row: Leg C compares
// against the balance *as of* a moment, and a custodian reporting a stale
// figure must be visible as stale rather than look current.
type CustodianSnapshot struct {
	CustodianID  string
	Currency     string
	AsOf         time.Time
	Balance      *big.Int
	Source       string
	StatementRef string
}

var ErrUnknownChain = errors.New("unknown chain")

// SaveChainSupplySnapshot upserts by height. Re-posting the same height is
// how an indexer that restarts mid-batch behaves, and overwriting is correct:
// a later read of the same block is at worst equally true and at best a
// correction after a reorg.
func (r *Repository) SaveChainSupplySnapshot(ctx context.Context, s ChainSupplySnapshot) error {
	if s.TotalSupply == nil || s.TotalSupply.Sign() < 0 {
		return postErr("INVALID_SUPPLY", "total_supply must be a non-negative integer")
	}
	if s.CapturedAt.IsZero() {
		s.CapturedAt = time.Now().UTC()
	}

	switch s.Chain {
	case "ETHEREUM":
		row := EthSupplySnapshot{
			BlockNumber: s.Height,
			BlockHash:   s.BlockHash,
			TotalSupply: s.TotalSupply,
			Source:      s.Source,
			CapturedAt:  s.CapturedAt,
		}
		return r.db.WithContext(ctx).Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "block_number"}},
			DoUpdates: clause.AssignmentColumns([]string{"total_supply", "block_hash", "source", "captured_at"}),
		}).Create(&row).Error

	case "SOLANA":
		row := SolSupplySnapshot{
			Slot:        s.Height,
			TotalSupply: s.TotalSupply,
			Source:      s.Source,
			CapturedAt:  s.CapturedAt,
		}
		return r.db.WithContext(ctx).Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "slot"}},
			DoUpdates: clause.AssignmentColumns([]string{"total_supply", "source", "captured_at"}),
		}).Create(&row).Error

	default:
		return postErr("UNKNOWN_CHAIN", "chain %q is not one this ledger tracks supply for", s.Chain)
	}
}

// LatestChainSupply reads back the highest-block snapshot for a chain. The
// reconciliation job prefers this over an RPC call when the indexer is
// running: it is the same number sourced from a process whose whole job is to
// be right about it, and it does not fail the run when an RPC endpoint is
// having a bad minute.
func (r *Repository) LatestChainSupply(ctx context.Context, chain string) (*big.Int, uint64, time.Time, error) {
	switch chain {
	case "ETHEREUM":
		var row EthSupplySnapshot
		err := r.db.WithContext(ctx).Order("block_number DESC").First(&row).Error
		if err != nil {
			return nil, 0, time.Time{}, err
		}
		return row.TotalSupply, row.BlockNumber, row.CapturedAt, nil
	case "SOLANA":
		var row SolSupplySnapshot
		err := r.db.WithContext(ctx).Order("slot DESC").First(&row).Error
		if err != nil {
			return nil, 0, time.Time{}, err
		}
		return row.TotalSupply, row.Slot, row.CapturedAt, nil
	default:
		return nil, 0, time.Time{}, ErrUnknownChain
	}
}

// SaveCustodianSnapshot writes what a custodian reported. This is the call
// that unblocks Leg C: it has been skipped on every run this platform has ever
// performed because nothing ever inserted a row here.
func (r *Repository) SaveCustodianSnapshot(ctx context.Context, s CustodianSnapshot) error {
	if s.Balance == nil || s.Balance.Sign() < 0 {
		return postErr("INVALID_BALANCE", "balance must be a non-negative integer")
	}
	if s.CustodianID == "" {
		s.CustodianID = "primary"
	}
	if s.Currency == "" {
		s.Currency = PegCurrency
	}
	if s.AsOf.IsZero() {
		s.AsOf = time.Now().UTC()
	}
	if _, err := r.Currency(ctx, s.Currency); err != nil {
		return err
	}

	row := TrustBankSnapshot{
		CustodianID:  s.CustodianID,
		Currency:     s.Currency,
		AsOf:         s.AsOf.UTC(),
		Balance:      s.Balance,
		Source:       s.Source,
		StatementRef: s.StatementRef,
	}
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "custodian_id"}, {Name: "currency"}, {Name: "as_of"}},
		DoUpdates: clause.AssignmentColumns([]string{"balance", "source", "statement_ref"}),
	}).Create(&row).Error
}

// CustodianBalance sums the latest snapshot of every custodian holding the
// currency. Summing rather than taking one row is what makes a second
// custodian a configuration change instead of a code change — and taking each
// custodian's *latest* rather than the latest row overall is what stops a
// custodian that reports hourly from masking one that has gone silent.
//
// asOf is the oldest of the contributing snapshots: a total is only as fresh
// as its stalest part.
func (r *Repository) CustodianBalance(ctx context.Context, currency string) (total *big.Int, asOf time.Time, err error) {
	var rows []TrustBankSnapshot
	err = r.db.WithContext(ctx).Raw(`
		SELECT DISTINCT ON (custodian_id) *
		  FROM trust_bank_snapshot
		 WHERE currency = ?
		 ORDER BY custodian_id, as_of DESC`, currency).Scan(&rows).Error
	if err != nil {
		return nil, time.Time{}, err
	}
	if len(rows) == 0 {
		return nil, time.Time{}, ErrNoTrustBankSnapshot
	}

	total = new(big.Int)
	for _, row := range rows {
		if row.Balance != nil {
			total.Add(total, row.Balance)
		}
		if asOf.IsZero() || row.AsOf.Before(asOf) {
			asOf = row.AsOf
		}
	}
	return total, asOf.UTC(), nil
}

// ---------------------------------------------------------------------------
// Reconciliation runs and breaks
// ---------------------------------------------------------------------------

// ReconciliationRun is one observation: every leg, every input, one timestamp.
type ReconciliationRun struct {
	ID         string     `gorm:"column:id;primaryKey"`
	StartedAt  time.Time  `gorm:"column:started_at"`
	FinishedAt *time.Time `gorm:"column:finished_at"`
	Status     string     `gorm:"column:status"`

	LegAOK *bool `gorm:"column:leg_a_ok"`
	LegBOK *bool `gorm:"column:leg_b_ok"`
	LegCOK *bool `gorm:"column:leg_c_ok"`

	Issued      *big.Int   `gorm:"column:issued;serializer:bigint"`
	InTransit   *big.Int   `gorm:"column:in_transit;serializer:bigint"`
	EthSupply   *big.Int   `gorm:"column:eth_supply;serializer:bigint"`
	SolSupply   *big.Int   `gorm:"column:sol_supply;serializer:bigint"`
	Backing     *big.Int   `gorm:"column:backing;serializer:bigint"`
	LedgerCash  *big.Int   `gorm:"column:ledger_cash;serializer:bigint"`
	BankBalance *big.Int   `gorm:"column:bank_balance;serializer:bigint"`
	BankAsOf    *time.Time `gorm:"column:bank_as_of"`

	BreakCount  int    `gorm:"column:break_count"`
	Error       string `gorm:"column:error"`
	TriggeredBy string `gorm:"column:triggered_by"`
}

func (ReconciliationRun) TableName() string { return "reconciliation_runs" }

// Run statuses. ERROR is not a failure of the platform, it is a failure to
// look — kept distinct so a dashboard cannot render "we could not check" as
// green.
const (
	RunOK     = "OK"
	RunBreaks = "BREAKS"
	RunError  = "ERROR"
)

// ReconciliationBreak is a condition with a lifetime, not an event. The same
// custodian shortfall observed on twelve consecutive runs is one row with
// twelve observations — which is what makes "how long were we out of balance"
// answerable and the open list a queue that can be finished.
type ReconciliationBreak struct {
	ID     string `gorm:"column:id;primaryKey"`
	Leg    string `gorm:"column:leg"`
	Code   string `gorm:"column:code"`
	Detail string `gorm:"column:detail"`

	OpenedRunID  string    `gorm:"column:opened_run_id"`
	OpenedAt     time.Time `gorm:"column:opened_at"`
	LastRunID    string    `gorm:"column:last_run_id"`
	LastSeenAt   time.Time `gorm:"column:last_seen_at"`
	Observations int       `gorm:"column:observations"`

	FirstDrift *big.Int `gorm:"column:first_drift;serializer:bigint"`
	Drift      *big.Int `gorm:"column:drift;serializer:bigint"`

	ResolvedAt    *time.Time `gorm:"column:resolved_at"`
	ResolvedRunID *string    `gorm:"column:resolved_run_id"`
}

func (ReconciliationBreak) TableName() string { return "reconciliation_breaks" }

func (r *Repository) SaveReconciliationRun(ctx context.Context, run *ReconciliationRun) error {
	if run.ID == "" {
		run.ID = uuid.New().String()
	}
	if run.StartedAt.IsZero() {
		run.StartedAt = time.Now().UTC()
	}
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		UpdateAll: true,
	}).Create(run).Error
}

// OpenOrUpdateBreak is the whole break lifecycle in one statement.
//
// The UNIQUE partial index on (leg, code) WHERE resolved_at IS NULL is what
// makes this safe under two reconcilers running at once: the second one's
// INSERT collides and takes the update path instead of opening a duplicate.
// Returning whether the row was newly opened is what lets the caller alert
// once per break rather than once per run — an alert that fires every five
// minutes for a week is an alert nobody reads.
func (r *Repository) OpenOrUpdateBreak(ctx context.Context, b *ReconciliationBreak) (opened bool, err error) {
	if b.ID == "" {
		b.ID = uuid.New().String()
	}
	now := time.Now().UTC()
	if b.OpenedAt.IsZero() {
		b.OpenedAt = now
	}
	b.LastSeenAt = now
	b.FirstDrift = b.Drift

	res := r.db.WithContext(ctx).Raw(`
		INSERT INTO reconciliation_breaks
			(id, leg, code, detail, opened_run_id, opened_at, last_run_id, last_seen_at,
			 observations, first_drift, drift)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
		ON CONFLICT (leg, code) WHERE resolved_at IS NULL DO UPDATE SET
			detail       = EXCLUDED.detail,
			last_run_id  = EXCLUDED.last_run_id,
			last_seen_at = EXCLUDED.last_seen_at,
			drift        = EXCLUDED.drift,
			observations = reconciliation_breaks.observations + 1
		RETURNING id, (xmax = 0) AS inserted`,
		b.ID, b.Leg, b.Code, b.Detail, b.OpenedRunID, b.OpenedAt, b.LastRunID, b.LastSeenAt,
		bigIntOrZero(b.FirstDrift), bigIntOrZero(b.Drift))

	var out struct {
		ID       string
		Inserted bool
	}
	if err := res.Scan(&out).Error; err != nil {
		return false, err
	}
	b.ID = out.ID
	return out.Inserted, nil
}

// ResolveBreaks closes every open break for a leg that this run did not
// re-observe. Auto-resolution is deliberate: a break is a statement about the
// world, and when the world stops being that way the row should say so without
// anyone clicking anything. The run that closed it is recorded so the
// resolution is as auditable as the opening.
func (r *Repository) ResolveBreaks(ctx context.Context, runID string, stillOpen map[string]bool) ([]ReconciliationBreak, error) {
	var open []ReconciliationBreak
	if err := r.db.WithContext(ctx).Where("resolved_at IS NULL").Find(&open).Error; err != nil {
		return nil, err
	}

	var resolved []ReconciliationBreak
	for _, b := range open {
		if stillOpen[b.Leg+":"+b.Code] {
			continue
		}
		now := time.Now().UTC()
		err := r.db.WithContext(ctx).Model(&ReconciliationBreak{}).
			Where("id = ? AND resolved_at IS NULL", b.ID).
			Updates(map[string]any{"resolved_at": now, "resolved_run_id": runID}).Error
		if err != nil {
			return resolved, err
		}
		b.ResolvedAt = &now
		b.ResolvedRunID = &runID
		resolved = append(resolved, b)
	}
	return resolved, nil
}

func (r *Repository) OpenBreakCount(ctx context.Context) (int64, error) {
	var n int64
	err := r.db.WithContext(ctx).Model(&ReconciliationBreak{}).Where("resolved_at IS NULL").Count(&n).Error
	return n, err
}

// EnqueueEvent writes a standalone outbox row — one not joined to a money
// transaction, because reconciliation moves no money. It still goes through
// the outbox rather than an HTTP call so that delivery survives the process:
// a CronJob pod that alerts by calling Slack directly and then exits has no
// retry, and the one run where that call fails is the one where somebody
// needed to know.
func (r *Repository) EnqueueEvent(ctx context.Context, eventType, aggregateType, aggregateID string, payload []byte) error {
	return outbox.Enqueue(r.db.WithContext(ctx), &outbox.Event{
		EventType:     eventType,
		AggregateType: aggregateType,
		AggregateID:   aggregateID,
		Payload:       string(payload),
	})
}

func (r *Repository) OpenBreaks(ctx context.Context) ([]ReconciliationBreak, error) {
	var out []ReconciliationBreak
	err := r.db.WithContext(ctx).Where("resolved_at IS NULL").Order("opened_at DESC").Find(&out).Error
	return out, err
}

func (r *Repository) ReconciliationRuns(ctx context.Context, limit int) ([]ReconciliationRun, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var out []ReconciliationRun
	err := r.db.WithContext(ctx).Order("started_at DESC").Limit(limit).Find(&out).Error
	return out, err
}

func (r *Repository) ReconciliationRun(ctx context.Context, id string) (*ReconciliationRun, error) {
	var out ReconciliationRun
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&out).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

// BreaksForRun returns every break this run touched — opened, re-observed or
// resolved — which is what a run detail page shows.
func (r *Repository) BreaksForRun(ctx context.Context, runID string) ([]ReconciliationBreak, error) {
	var out []ReconciliationBreak
	err := r.db.WithContext(ctx).
		Where("opened_run_id = ? OR last_run_id = ? OR resolved_run_id = ?", runID, runID, runID).
		Order("opened_at DESC").Find(&out).Error
	return out, err
}

// bigIntOrZero renders a possibly-nil amount for the raw SQL above, where a
// Go nil would become NULL and violate the NOT NULL the drift columns don't
// have but the arithmetic downstream assumes.
func bigIntOrZero(v *big.Int) string {
	if v == nil {
		return "0"
	}
	return v.String()
}
