// Package store is the indexer's own database: blocks, events, cursors and
// the supply reports it owes core-ledger.
//
// It deliberately holds no balances. The indexer is a witness, not a second
// ledger — every number it derives about money is POSTed to core-ledger and
// lives there (docs/building-plan.md, "core-ledger is the only place value
// exists"). What lives here is the chain's own history, which core-ledger has
// no business storing.
package store

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"fmt"
	"math/big"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" database/sql driver
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

type Store struct {
	db *sql.DB
}

// Open connects, runs migrations and returns a store. Same shape as
// core-ledger's NewRepository: migrations run at boot rather than in a script
// a new environment can forget.
func Open(dsn string) (*Store, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("opening the indexer database: %w", err)
	}
	db.SetMaxOpenConns(15)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return nil, err
	}
	if err := goose.Up(db, "migrations"); err != nil {
		return nil, fmt.Errorf("running indexer migrations: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) DB() *sql.DB { return s.db }

func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }

func (s *Store) Close() error { return s.db.Close() }

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

type Block struct {
	Chain      string
	Height     uint64
	Hash       string
	ParentHash string
	BlockTime  time.Time
}

// PutBlock records a header as canonical, demoting whatever else held that
// height.
//
// The demotion and the insert are one transaction because the partial unique
// index (chain, height) WHERE canonical would otherwise reject the insert on
// a reorg — and doing it in the other order would leave a window with no
// canonical block at that height, which any concurrent read would see as a
// gap in the chain.
func (s *Store) PutBlock(ctx context.Context, b Block) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	_, err = tx.ExecContext(ctx, `
		UPDATE chain_blocks SET canonical = FALSE, orphaned_at = now()
		 WHERE chain = $1 AND height = $2 AND block_hash <> $3 AND canonical`,
		b.Chain, b.Height, b.Hash)
	if err != nil {
		return fmt.Errorf("demoting the previous block at %s/%d: %w", b.Chain, b.Height, err)
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO chain_blocks (chain, height, block_hash, parent_hash, block_time, canonical, orphaned_at)
		VALUES ($1, $2, $3, $4, $5, TRUE, NULL)
		ON CONFLICT (chain, height, block_hash) DO UPDATE SET
			parent_hash = EXCLUDED.parent_hash,
			block_time  = EXCLUDED.block_time,
			canonical   = TRUE,
			orphaned_at = NULL`,
		b.Chain, b.Height, b.Hash, b.ParentHash, nullTime(b.BlockTime))
	if err != nil {
		return fmt.Errorf("recording block %s/%d: %w", b.Chain, b.Height, err)
	}
	return tx.Commit()
}

// CanonicalHashAt backs reorg.Known.
func (s *Store) CanonicalHashAt(ctx context.Context, chain string, height uint64) (string, bool, error) {
	var hash string
	err := s.db.QueryRowContext(ctx,
		`SELECT block_hash FROM chain_blocks WHERE chain = $1 AND height = $2 AND canonical`,
		chain, height).Scan(&hash)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return hash, true, nil
}

// Orphan un-believes everything strictly above a height.
//
// Both tables, one transaction, and nothing is deleted. A consumer that acted
// on an orphaned event needs to be able to see what it acted on; deleting the
// row would leave a correction nobody could explain.
func (s *Store) Orphan(ctx context.Context, chain string, above uint64) (blocks, events int64, err error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer func() { _ = tx.Rollback() }()

	br, err := tx.ExecContext(ctx, `
		UPDATE chain_blocks SET canonical = FALSE, orphaned_at = now()
		 WHERE chain = $1 AND height > $2 AND canonical`, chain, above)
	if err != nil {
		return 0, 0, err
	}
	blocks, _ = br.RowsAffected()

	er, err := tx.ExecContext(ctx, `
		UPDATE chain_events SET canonical = FALSE, orphaned_at = now()
		 WHERE chain = $1 AND block_height > $2 AND canonical`, chain, above)
	if err != nil {
		return 0, 0, err
	}
	events, _ = er.RowsAffected()

	return blocks, events, tx.Commit()
}

// PruneBlocks keeps the header window bounded. Events are kept (they are the
// audit trail and Timescale's retention policy is the right tool for them);
// headers below the reorg floor can never be needed again, because a fork that
// deep is refused rather than absorbed.
func (s *Store) PruneBlocks(ctx context.Context, chain string, below uint64) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM chain_blocks WHERE chain = $1 AND height < $2`, chain, below)
	return err
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

type Event struct {
	ID            string
	Chain         string
	EventType     string
	Contract      string
	BlockHeight   uint64
	BlockHash     string
	TxHash        string
	LogIndex      int
	CorrelationID string
	Payload       map[string]any
	BlockTime     time.Time
}

// PutEvents upserts a batch.
//
// Upsert rather than insert because re-reading a range is the indexer's normal
// recovery: a restart, a lease change, a cursor rewound past a fork. The
// natural key is (chain, tx_hash, log_index) — one log position exists once —
// so a re-read is a no-op and a post-reorg re-read revives the row as
// canonical with whatever the new block says.
func (s *Store) PutEvents(ctx context.Context, events []Event) error {
	if len(events) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO chain_events
			(id, chain, event_type, contract, block_height, block_hash, tx_hash,
			 log_index, correlation_id, payload, canonical, orphaned_at, block_time)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,NULL,$11)
		ON CONFLICT (chain, tx_hash, log_index, block_time) DO UPDATE SET
			block_height   = EXCLUDED.block_height,
			block_hash     = EXCLUDED.block_hash,
			event_type     = EXCLUDED.event_type,
			correlation_id = EXCLUDED.correlation_id,
			payload        = EXCLUDED.payload,
			canonical      = TRUE,
			orphaned_at    = NULL`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, e := range events {
		payload, merr := json.Marshal(e.Payload)
		if merr != nil {
			return fmt.Errorf("encoding the payload of %s %s: %w", e.EventType, e.TxHash, merr)
		}
		blockTime := e.BlockTime
		if blockTime.IsZero() {
			blockTime = time.Now().UTC()
		}
		_, err = stmt.ExecContext(ctx, e.ID, e.Chain, e.EventType, e.Contract,
			e.BlockHeight, e.BlockHash, e.TxHash, e.LogIndex, e.CorrelationID,
			string(payload), blockTime.UTC())
		if err != nil {
			return fmt.Errorf("recording %s %s#%d: %w", e.EventType, e.TxHash, e.LogIndex, err)
		}
	}
	return tx.Commit()
}

// Finality is what the saga asks instead of polling a chain.
//
// It answers "is this transaction in a canonical block that is at least N
// blocks behind the head" — which is the same question WaitForFinality asks an
// RPC endpoint, answered from a process that is already watching. That is what
// removes the ~15 minute Ethereum `finalized` latency from the saga's critical
// path: the indexer's confirmation depth is a number this platform chose,
// not a checkpoint the consensus layer chose.
type Finality struct {
	Found         bool
	Canonical     bool
	BlockHeight   uint64
	Confirmations uint64
}

func (s *Store) Finality(ctx context.Context, chain, txHash string, head uint64) (Finality, error) {
	var (
		height    uint64
		canonical bool
	)
	err := s.db.QueryRowContext(ctx, `
		SELECT block_height, canonical FROM chain_events
		 WHERE chain = $1 AND tx_hash = $2
		 ORDER BY canonical DESC, block_height DESC
		 LIMIT 1`, chain, txHash).Scan(&height, &canonical)
	if err == sql.ErrNoRows {
		return Finality{}, nil
	}
	if err != nil {
		return Finality{}, err
	}

	var confirmations uint64
	if head >= height {
		confirmations = head - height
	}
	return Finality{Found: true, Canonical: canonical, BlockHeight: height, Confirmations: confirmations}, nil
}

type EventFilter struct {
	Chain         string
	EventType     string
	CorrelationID string
	TxHash        string
	IncludeOrphan bool
	Limit         int
}

func (s *Store) Events(ctx context.Context, f EventFilter) ([]Event, error) {
	if f.Limit <= 0 || f.Limit > 500 {
		f.Limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, chain, event_type, contract, block_height, block_hash, tx_hash,
		       log_index, correlation_id, payload, block_time, canonical
		  FROM chain_events
		 WHERE ($1 = '' OR chain = $1)
		   AND ($2 = '' OR event_type = $2)
		   AND ($3 = '' OR correlation_id = $3)
		   AND ($4 = '' OR tx_hash = $4)
		   AND ($5 OR canonical)
		 ORDER BY block_time DESC, log_index DESC
		 LIMIT $6`,
		f.Chain, f.EventType, f.CorrelationID, f.TxHash, f.IncludeOrphan, f.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Event
	for rows.Next() {
		var (
			e         Event
			payload   []byte
			canonical bool
		)
		if err := rows.Scan(&e.ID, &e.Chain, &e.EventType, &e.Contract, &e.BlockHeight,
			&e.BlockHash, &e.TxHash, &e.LogIndex, &e.CorrelationID, &payload,
			&e.BlockTime, &canonical); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(payload, &e.Payload)
		if e.Payload == nil {
			e.Payload = map[string]any{}
		}
		e.Payload["canonical"] = canonical
		out = append(out, e)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Cursors
// ---------------------------------------------------------------------------

func (s *Store) Cursor(ctx context.Context, chain string) (height uint64, hash string, err error) {
	err = s.db.QueryRowContext(ctx,
		`SELECT last_height, last_block_hash FROM cursors WHERE chain = $1 AND stream = 'events'`,
		chain).Scan(&height, &hash)
	if err == sql.ErrNoRows {
		return 0, "", nil
	}
	return height, hash, err
}

func (s *Store) SetCursor(ctx context.Context, chain string, height uint64, hash string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO cursors (chain, stream, last_height, last_block_hash, updated_at)
		VALUES ($1, 'events', $2, $3, now())
		ON CONFLICT (chain, stream) DO UPDATE SET
			last_height     = EXCLUDED.last_height,
			last_block_hash = EXCLUDED.last_block_hash,
			updated_at      = now()`, chain, height, hash)
	return err
}

// ---------------------------------------------------------------------------
// Supply reports
// ---------------------------------------------------------------------------

type SupplyReport struct {
	Chain       string
	Height      uint64
	BlockHash   string
	TotalSupply *big.Int
	Attempts    int
}

// RecordSupply writes what the chain reported *before* anything tries to tell
// core-ledger about it. An indexer that read supply, died, and restarted would
// otherwise skip that height forever — and a missing supply snapshot is not a
// visible failure, it is a reconciliation that quietly compares against an
// older number.
func (s *Store) RecordSupply(ctx context.Context, r SupplyReport) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO supply_reports (chain, height, block_hash, total_supply)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (chain, height) DO UPDATE SET
			total_supply = EXCLUDED.total_supply,
			block_hash   = EXCLUDED.block_hash`,
		r.Chain, r.Height, r.BlockHash, r.TotalSupply.String())
	return err
}

func (s *Store) UnpostedSupply(ctx context.Context, limit int) ([]SupplyReport, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT chain, height, block_hash, total_supply, attempts
		  FROM supply_reports
		 WHERE posted_at IS NULL
		 ORDER BY chain, height
		 LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []SupplyReport
	for rows.Next() {
		var (
			r      SupplyReport
			supply string
		)
		if err := rows.Scan(&r.Chain, &r.Height, &r.BlockHash, &supply, &r.Attempts); err != nil {
			return nil, err
		}
		r.TotalSupply, _ = new(big.Int).SetString(supply, 10)
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) MarkSupplyPosted(ctx context.Context, chain string, height uint64) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE supply_reports SET posted_at = now(), last_error = '' WHERE chain = $1 AND height = $2`,
		chain, height)
	return err
}

func (s *Store) MarkSupplyFailed(ctx context.Context, chain string, height uint64, cause string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE supply_reports SET attempts = attempts + 1, last_error = $3 WHERE chain = $1 AND height = $2`,
		chain, height, truncate(cause, 2000))
	return err
}

func nullTime(t time.Time) any {
	if t.IsZero() {
		return nil
	}
	return t.UTC()
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
