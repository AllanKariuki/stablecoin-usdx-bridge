package ledger

import (
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"log"
	"math/big"
	"os"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" database/sql driver
	"github.com/pressly/goose/v3"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
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
	return &Repository{db: db}, nil
}

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

// InFlight returns transfers that are mid-saga, used both to resume after a
// crash and to net out of the reconciliation job's supply check.
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
