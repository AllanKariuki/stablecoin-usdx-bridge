// Package audit is the append-only, hash-chained record of every signature
// this service has produced — and every one it has refused.
//
// The chain matters because of what this log is. It is the record of every
// authorisation of every movement of money on the platform, which makes it
// the most valuable thing for an attacker who reached this service to alter
// afterwards. A row carrying the hash of its predecessor means removing or
// editing one breaks every hash after it, detectably, by anyone who can read
// the table — without having to trust the process that wrote it.
//
// Denials are recorded as carefully as approvals. A burst of refusals is the
// first sign of a compromised caller probing what it can get through, and a
// log that only records successes would show that as silence.
package audit

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

const (
	OutcomeAllowed = "ALLOWED"
	OutcomeDenied  = "DENIED"
	OutcomeError   = "ERROR"
)

// GenesisHash is the prev_hash of the first row. A fixed, recognisable value
// rather than an empty string, so "the chain starts here" is distinguishable
// from "somebody wrote an empty prev_hash".
const GenesisHash = "0000000000000000000000000000000000000000000000000000000000000000"

type Record struct {
	ID            string
	Chain         string
	Method        string
	KeyID         string
	Backend       string
	Caller        string
	Amount        string
	Destination   string
	CorrelationID string
	Digest        string
	Signature     string
	Outcome       string
	Reason        string
	CreatedAt     time.Time
	PrevHash      string
	Hash          string
}

type Log struct {
	db *sql.DB
}

func Open(dsn string) (*Log, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("opening the signer database: %w", err)
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(30 * time.Minute)

	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return nil, err
	}
	if err := goose.Up(db, "migrations"); err != nil {
		return nil, fmt.Errorf("running signer migrations: %w", err)
	}
	return &Log{db: db}, nil
}

func (l *Log) Ping(ctx context.Context) error { return l.db.PingContext(ctx) }
func (l *Log) Close() error                   { return l.db.Close() }

// ErrAlreadySigned means this (chain, method, correlation_id) has a signature
// already. The caller replays it rather than producing a second.
var ErrAlreadySigned = errors.New("already signed")

// Existing returns a previous ALLOWED signature for this correlation, if one
// exists.
//
// This is the plan's *"idempotent on (chain, method, correlation_id) — a
// retried mint returns the original tx hash"*. Without it, a saga retry after
// a timeout produces a second valid signature for the same movement: the
// chain's replay guard stops the second transaction landing, but the platform
// has authorised the same money twice and which signature is the real one is
// unanswerable.
func (l *Log) Existing(ctx context.Context, chain, method, correlationID string) (*Record, error) {
	if correlationID == "" {
		return nil, nil
	}
	row := l.db.QueryRowContext(ctx, `
		SELECT id, chain, method, key_id, backend, caller, amount, destination,
		       correlation_id, digest, signature, outcome, reason, created_at, prev_hash, hash
		  FROM signatures
		 WHERE chain = $1 AND method = $2 AND correlation_id = $3 AND outcome = 'ALLOWED'
		 LIMIT 1`, chain, method, correlationID)

	var r Record
	err := row.Scan(&r.ID, &r.Chain, &r.Method, &r.KeyID, &r.Backend, &r.Caller, &r.Amount,
		&r.Destination, &r.CorrelationID, &r.Digest, &r.Signature, &r.Outcome, &r.Reason,
		&r.CreatedAt, &r.PrevHash, &r.Hash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// Append writes one record, linked to its predecessor.
//
// The read of the tip and the insert happen in one SERIALIZABLE transaction,
// because two concurrent appends that both read the same tip would produce
// two rows claiming the same predecessor — a fork in a chain whose whole
// value is that it has none.
func (l *Log) Append(ctx context.Context, r *Record) error {
	tx, err := l.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var prev string
	err = tx.QueryRowContext(ctx, `SELECT hash FROM signatures ORDER BY seq DESC LIMIT 1`).Scan(&prev)
	if errors.Is(err, sql.ErrNoRows) {
		prev = GenesisHash
	} else if err != nil {
		return err
	}

	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	r.CreatedAt = time.Now().UTC()
	r.PrevHash = prev
	r.Hash = hashOf(r)

	_, err = tx.ExecContext(ctx, `
		INSERT INTO signatures
			(id, chain, method, key_id, backend, caller, amount, destination, correlation_id,
			 digest, signature, outcome, reason, created_at, prev_hash, hash)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		r.ID, r.Chain, r.Method, r.KeyID, r.Backend, r.Caller, r.Amount, r.Destination,
		r.CorrelationID, r.Digest, r.Signature, r.Outcome, r.Reason, r.CreatedAt, r.PrevHash, r.Hash)
	if err != nil {
		if strings.Contains(err.Error(), "uq_signatures_idempotent") {
			return ErrAlreadySigned
		}
		return err
	}
	return tx.Commit()
}

// DailyTotal is what the policy's daily limit is checked against: the sum of
// everything allowed for this (chain, method) since midnight UTC.
//
// Midnight UTC rather than a rolling window, deliberately. A rolling
// twenty-four hours is harder to reason about during an incident ("how much
// is left today" has no answer), and the whole point of the limit is that a
// human can hold it in their head.
func (l *Log) DailyTotal(ctx context.Context, chain, method string) (*big.Int, error) {
	rows, err := l.db.QueryContext(ctx, `
		SELECT amount FROM signatures
		 WHERE chain = $1 AND method = $2 AND outcome = 'ALLOWED'
		   AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
		   AND amount <> ''`, chain, method)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	total := new(big.Int)
	for rows.Next() {
		var amount string
		if err := rows.Scan(&amount); err != nil {
			return nil, err
		}
		if v, ok := new(big.Int).SetString(amount, 10); ok {
			total.Add(total, v)
		}
	}
	return total, rows.Err()
}

// Verify walks the chain and reports the first row whose hash does not follow
// from its predecessor.
//
// This is the endpoint an auditor calls. It is deliberately a full walk
// rather than a spot check: a tamper that only breaks one link is exactly
// what a spot check misses.
func (l *Log) Verify(ctx context.Context) (ok bool, brokenAt string, checked int, err error) {
	rows, err := l.db.QueryContext(ctx, `
		SELECT id, chain, method, key_id, backend, caller, amount, destination,
		       correlation_id, digest, signature, outcome, reason, created_at, prev_hash, hash
		  FROM signatures ORDER BY seq`)
	if err != nil {
		return false, "", 0, err
	}
	defer rows.Close()

	expectedPrev := GenesisHash
	for rows.Next() {
		var r Record
		if err := rows.Scan(&r.ID, &r.Chain, &r.Method, &r.KeyID, &r.Backend, &r.Caller, &r.Amount,
			&r.Destination, &r.CorrelationID, &r.Digest, &r.Signature, &r.Outcome, &r.Reason,
			&r.CreatedAt, &r.PrevHash, &r.Hash); err != nil {
			return false, "", checked, err
		}
		checked++

		if r.PrevHash != expectedPrev {
			return false, r.ID, checked, nil
		}
		if hashOf(&r) != r.Hash {
			return false, r.ID, checked, nil
		}
		expectedPrev = r.Hash
	}
	return true, "", checked, rows.Err()
}

func (l *Log) Recent(ctx context.Context, limit int) ([]Record, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := l.db.QueryContext(ctx, `
		SELECT id, chain, method, key_id, backend, caller, amount, destination,
		       correlation_id, digest, signature, outcome, reason, created_at, prev_hash, hash
		  FROM signatures ORDER BY seq DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Record
	for rows.Next() {
		var r Record
		if err := rows.Scan(&r.ID, &r.Chain, &r.Method, &r.KeyID, &r.Backend, &r.Caller, &r.Amount,
			&r.Destination, &r.CorrelationID, &r.Digest, &r.Signature, &r.Outcome, &r.Reason,
			&r.CreatedAt, &r.PrevHash, &r.Hash); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// hashOf is the chain's link function.
//
// Every field that describes *what was authorised* is included. A field left
// out is a field an attacker could change without breaking the chain — so the
// timestamp, the caller and the reason are all in here, not just the
// signature.
//
// The separator is a byte that cannot appear in any of the values, so that
// two different field splits cannot produce the same input: without it,
// {caller: "a", method: "bc"} and {caller: "ab", method: "c"} would hash
// identically.
func hashOf(r *Record) string {
	h := sha256.New()
	for _, field := range []string{
		r.PrevHash, r.ID, r.Chain, r.Method, r.KeyID, r.Backend, r.Caller,
		r.Amount, r.Destination, r.CorrelationID, r.Digest, r.Signature,
		r.Outcome, r.Reason, r.CreatedAt.UTC().Format(time.RFC3339Nano),
	} {
		h.Write([]byte(field))
		h.Write([]byte{0x1f}) // unit separator
	}
	return hex.EncodeToString(h.Sum(nil))
}
