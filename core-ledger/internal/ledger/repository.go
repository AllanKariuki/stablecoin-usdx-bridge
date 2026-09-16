package ledger

import (
	"database/sql"
	"errors"
	"math/big"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

type Repository struct {
	db *sqlx.DB
}

func NewRepository(connString string) (*Repository, error) {
	db, err := sqlx.Connect("postgres", connString)
	if err != nil {
		return nil, err
	}
	return &Repository{db: db}, nil
}

func (r *Repository) Insert(t *BridgeTransfer) error {
	_, err := r.db.NamedExec(`
		INSERT INTO bridge_transfers
			(correlation_id, user_address, amount, source_chain, target_chain, status)
		VALUES
			(:correlation_id, :user_address, :amount, :source_chain, :target_chain, :status)
	`, t)
	return err
}

func (r *Repository) UpdateStatus(correlationID string, status TransferStatus) error {
	_, err := r.db.Exec(`
		UPDATE bridge_transfers SET status = $1, updated_at = now() WHERE correlation_id = $2
	`, status, correlationID)
	return err
}

func (r *Repository) FindByCorrelationID(correlationID string) (*BridgeTransfer, error) {
	var t BridgeTransfer
	err := r.db.Get(&t, `SELECT * FROM bridge_transfers WHERE correlation_id = $1`, correlationID)
	return &t, err
}

// InFlight returns transfers that are mid-saga, used both to resume after a
// crash and to net out of the reconciliation job's supply check.
func (r *Repository) InFlight() ([]BridgeTransfer, error) {
	var ts []BridgeTransfer
	err := r.db.Select(&ts, `
		SELECT * FROM bridge_transfers
		WHERE status IN ('PENDING', 'BURN_CONFIRMED', 'MINT_SUBMITTED')
	`)
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
	var row struct {
		Balance *big.Int  `db:"balance"`
		AsOf    time.Time `db:"as_of"`
	}
	err := r.db.Get(&row, `
		SELECT balance, as_of FROM trust_bank_snapshot ORDER BY as_of DESC LIMIT 1
	`)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, time.Time{}, ErrNoTrustBankSnapshot
	}
	if err != nil {
		return nil, time.Time{}, err
	}
	return row.Balance, row.AsOf, nil
}
