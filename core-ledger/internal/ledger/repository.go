package ledger

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"log"
	"math/big"
	"os"
	"time"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" database/sql driver
	"github.com/pressly/goose/v3"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

type Repository struct {
	db *gorm.DB
}

// NewRepository opens the connection, runs goose migrations (versioned SQL
// files under migrations/, tracked in the goose_db_version table) to bring
// the schema up to date, then hands the same *sql.DB to GORM for querying.
// Schema management (constraints, defaults, indexes) lives entirely in
// those SQL files now — GORM's struct tags here are for query-time type
// mapping only, not a second source of schema truth.
func NewRepository(connString string) (*Repository, error) {
	sqlDB, err := sql.Open("pgx", connString)
	if err != nil {
		return nil, fmt.Errorf("opening postgres connection: %w", err)
	}

	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return nil, fmt.Errorf("setting goose dialect: %w", err)
	}
	if err := goose.Up(sqlDB, "migrations"); err != nil {
		return nil, fmt.Errorf("running migrations: %w", err)
	}

	// LatestTrustBankBalance treats gorm.ErrRecordNotFound as an expected,
	// already-handled state (no snapshot from the Bank Adapter service yet)
	// — IgnoreRecordNotFoundError keeps GORM from logging it as an error on
	// every reconciliation tick, which would otherwise drown out the job's
	// own "skipping comparison" log.
	gormLogger := logger.New(log.New(os.Stdout, "\r\n", log.LstdFlags), logger.Config{
		SlowThreshold:             200 * time.Millisecond,
		LogLevel:                  logger.Warn,
		IgnoreRecordNotFoundError: true,
	})
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: sqlDB}), &gorm.Config{Logger: gormLogger})
	if err != nil {
		return nil, err
	}

	// Pool bounds were never set — an unbounded pool under a connection-per-
	// request driver can exhaust Postgres's own max_connections during a
	// traffic spike. Conservative defaults; revisit once there's real load
	// data (see the platform config work planned for P0/shared/go/platform).
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)

	return &Repository{db: db}, nil
}

// Ping reports whether the database is reachable — the one dependency
// GET /readyz checks. It never mutates and never touches a chain, so a
// chain RPC hiccup can't fail it.
func (r *Repository) Ping(ctx context.Context) error {
	sqlDB, err := r.db.DB()
	if err != nil {
		return fmt.Errorf("getting underlying sql.DB: %w", err)
	}
	return sqlDB.PingContext(ctx)
}

// ---------------------------------------------------------------------------
// Reference data & chart seeding
// ---------------------------------------------------------------------------

// Bootstrap seeds the currencies the platform supports and the system accounts
// they imply. It is idempotent and safe to run on every boot: account ids are
// a deterministic hash of the GL code (see AccountIDFor), so re-running
// refreshes metadata without ever creating a second account for the same code
// or disturbing balances.
func (r *Repository) Bootstrap(ctx context.Context, currencies []Currency) error {
	if len(currencies) == 0 {
		currencies = DefaultCurrencies()
	}

	err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "code"}},
		DoUpdates: clause.AssignmentColumns([]string{"kind", "decimals", "name", "active"}),
	}).Create(&currencies).Error
	if err != nil {
		return fmt.Errorf("seeding currencies: %w", err)
	}

	accounts, err := BuildChart(currencies)
	if err != nil {
		return err
	}
	rows := make([]Account, 0, len(accounts))
	for _, a := range accounts {
		rows = append(rows, *a)
	}

	// status is deliberately not in DoUpdates: if an operator froze a system
	// account, a deploy must not silently thaw it.
	err = r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"gl_code", "name", "type", "currency", "normal_side",
			"parent_id", "hierarchy", "usage", "manual_entries_allowed", "description", "updated_at",
		}),
	}).CreateInBatches(rows, 100).Error
	if err != nil {
		return fmt.Errorf("seeding chart of accounts: %w", err)
	}
	return nil
}

func (r *Repository) Currency(ctx context.Context, code string) (*Currency, error) {
	var c Currency
	if err := r.db.WithContext(ctx).First(&c, "code = ? AND active = true", code).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, postErr("UNKNOWN_CURRENCY", "currency %q is not supported", code)
		}
		return nil, err
	}
	return &c, nil
}

func (r *Repository) Currencies(ctx context.Context) ([]Currency, error) {
	var cs []Currency
	err := r.db.WithContext(ctx).Where("active = true").Order("code").Find(&cs).Error
	return cs, err
}

func (r *Repository) AccountByGLCode(ctx context.Context, glCode string) (*Account, error) {
	var a Account
	if err := r.db.WithContext(ctx).First(&a, "gl_code = ?", glCode).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, postErr("UNKNOWN_ACCOUNT", "no account with GL code %s — has the chart been seeded for this currency?", glCode)
		}
		return nil, err
	}
	return &a, nil
}

func (r *Repository) Account(ctx context.Context, id string) (*Account, error) {
	var a Account
	err := r.db.WithContext(ctx).First(&a, "id = ?", id).Error
	return &a, err
}

// AccountsUnder returns an account and everything beneath it, using the
// materialized hierarchy path rather than a recursive walk.
func (r *Repository) AccountsUnder(ctx context.Context, glCode string) ([]Account, error) {
	root, err := r.AccountByGLCode(ctx, glCode)
	if err != nil {
		return nil, err
	}
	var accts []Account
	err = r.db.WithContext(ctx).Where("hierarchy LIKE ?", root.Hierarchy+"%").Order("gl_code").Find(&accts).Error
	return accts, err
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

func (r *Repository) FindTransaction(ctx context.Context, id string) (*Transaction, error) {
	var t Transaction
	err := r.db.WithContext(ctx).Preload("Entries", func(db *gorm.DB) *gorm.DB {
		return db.Order("journal_entries.line_no")
	}).First(&t, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) FindTransactionByIdempotencyKey(ctx context.Context, key string) (*Transaction, error) {
	var t Transaction
	err := r.db.WithContext(ctx).Preload("Entries", func(db *gorm.DB) *gorm.DB {
		return db.Order("journal_entries.line_no")
	}).First(&t, "idempotency_key = ?", key).Error
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// TransactionsForEntity walks from a domain object back to every journal
// transaction it caused — the point of the entity_type/entity_id pair.
func (r *Repository) TransactionsForEntity(ctx context.Context, typ EntityType, id string) ([]Transaction, error) {
	var ts []Transaction
	err := r.db.WithContext(ctx).Preload("Entries", func(db *gorm.DB) *gorm.DB {
		return db.Order("journal_entries.line_no")
	}).Where("entity_type = ? AND entity_id = ?", typ, id).Order("created_at").Find(&ts).Error
	return ts, err
}

// ListTransactionsPage returns up to limit transactions newest-first. A zero
// afterCreatedAt starts from the beginning; otherwise it positions a keyset
// cursor at the row after (afterCreatedAt, afterID) — cheaper and stabler
// under concurrent inserts than an OFFSET, which can skip or repeat rows as
// new transactions land ahead of the page being read. userID, when
// non-empty, restricts to transactions against that user's own wallets (via
// a join on the accounts they own) — the BFF's cross-wallet transaction
// list core-ledger doesn't otherwise have (see docs/building-plan.md's P1
// section).
func (r *Repository) ListTransactionsPage(ctx context.Context, userID string, afterCreatedAt time.Time, afterID string, limit int) ([]Transaction, error) {
	q := r.db.WithContext(ctx).Preload("Entries", func(db *gorm.DB) *gorm.DB {
		return db.Order("journal_entries.line_no")
	}).Order("created_at DESC, id DESC").Limit(limit)

	if userID != "" {
		q = q.Where(
			"id IN (SELECT DISTINCT transaction_id FROM journal_entries je "+
				"JOIN accounts a ON a.id = je.account_id WHERE a.owner_user_id = ?)",
			userID,
		)
	}
	if !afterCreatedAt.IsZero() {
		q = q.Where("(created_at, id) < (?, ?)", afterCreatedAt, afterID)
	}

	var ts []Transaction
	err := q.Find(&ts).Error
	return ts, err
}

// ListAccountsPage returns up to limit accounts ordered by the chart of
// accounts' own natural key, gl_code — stable and human-meaningful (unlike
// created_at, which mostly reflects bootstrap/seed order for a chart that's
// otherwise close to static). afterGLCode positions a keyset cursor; ""
// starts from the beginning.
func (r *Repository) ListAccountsPage(ctx context.Context, afterGLCode string, limit int) ([]Account, error) {
	q := r.db.WithContext(ctx).Order("gl_code ASC").Limit(limit)
	if afterGLCode != "" {
		q = q.Where("gl_code > ?", afterGLCode)
	}
	var accounts []Account
	err := q.Find(&accounts).Error
	return accounts, err
}

// ---------------------------------------------------------------------------
// FX quotes
// ---------------------------------------------------------------------------

func (r *Repository) SaveQuote(ctx context.Context, q *FxQuote) error {
	if q.ID == "" {
		q.ID = uuid.New().String()
	}
	if q.QuotedAt.IsZero() {
		q.QuotedAt = time.Now().UTC()
	}
	return r.db.WithContext(ctx).Create(q).Error
}

func (r *Repository) Quote(ctx context.Context, id string) (*FxQuote, error) {
	var q FxQuote
	if err := r.db.WithContext(ctx).First(&q, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, postErr("UNKNOWN_QUOTE", "no FX quote %s", id)
		}
		return nil, err
	}
	return &q, nil
}

// ---------------------------------------------------------------------------
// Accounting closures
// ---------------------------------------------------------------------------

// ClosePeriod locks everything on or before closingDate against further
// posting. Currency "" closes every currency at once.
func (r *Repository) ClosePeriod(ctx context.Context, currency string, closingDate time.Time, reason, closedBy string) (*LedgerClosure, error) {
	c := &LedgerClosure{
		ID:          uuid.New().String(),
		Currency:    currency,
		ClosingDate: closingDate.UTC().Truncate(24 * time.Hour),
		Reason:      reason,
		ClosedBy:    closedBy,
	}
	if err := r.db.WithContext(ctx).Create(c).Error; err != nil {
		return nil, err
	}
	return c, nil
}

func (r *Repository) Closures(ctx context.Context) ([]LedgerClosure, error) {
	var cs []LedgerClosure
	err := r.db.WithContext(ctx).Order("closing_date DESC").Find(&cs).Error
	return cs, err
}

// ---------------------------------------------------------------------------
// Bridge saga state (pre-existing)
// ---------------------------------------------------------------------------

func (r *Repository) Insert(t *BridgeTransfer) error {
	return r.db.Create(t).Error
}

func (r *Repository) UpdateStatus(correlationID string, status TransferStatus) error {
	return r.db.Model(&BridgeTransfer{}).
		Where("correlation_id = ?", correlationID).
		Update("status", status).Error
}

func (r *Repository) FindByCorrelationID(correlationID string) (*BridgeTransfer, error) {
	var t BridgeTransfer
	err := r.db.First(&t, "correlation_id = ?", correlationID).Error
	return &t, err
}

// InFlight returns transfers that are mid-saga, used to resume after a crash.
// Reconciliation no longer needs it: cross-chain value in flight is the
// balance of the bridge suspense account, which is derived from the journal
// rather than from a status scan.
func (r *Repository) InFlight() ([]BridgeTransfer, error) {
	var ts []BridgeTransfer
	err := r.db.Where(
		"status IN ?", []TransferStatus{StatusPending, StatusBurnConfirmed, StatusMintSubmitted},
	).Find(&ts).Error
	return ts, err
}

// ErrNoTrustBankSnapshot means no bank balance has been recorded yet —
// something upstream (the DAMP spec's Bank Adapter service, not part of
// this repo) is expected to insert into trust_bank_snapshot as it observes
// the custodian account, and reconciliation has nothing to compare against
// until the first row lands.
var ErrNoTrustBankSnapshot = errors.New("no trust bank snapshot recorded yet")

// LatestTrustBankBalance returns the most recently recorded fiat reserve
// balance and when it was captured, for the reconciliation job to compare
// against circulating on-chain supply.
func (r *Repository) LatestTrustBankBalance() (*big.Int, time.Time, error) {
	var row TrustBankSnapshot
	err := r.db.Order("as_of DESC").First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, time.Time{}, ErrNoTrustBankSnapshot
	}
	if err != nil {
		return nil, time.Time{}, err
	}
	return row.Balance, row.AsOf, nil
}
