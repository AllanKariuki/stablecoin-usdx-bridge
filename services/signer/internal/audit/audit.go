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

	trail "github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/audit"

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
	// PayloadDigest is decode.Decoded.PayloadDigest: what was authorised,
	// without nonce, gas or blockhash. Empty on rows from before 00002.
	PayloadDigest string
	Signature     string
	Outcome       string
	Reason        string
	CreatedAt     time.Time
	PrevHash      string
	Hash          string
}

// columns is every column a Record is read from, in scan order.
const columns = `id, chain, method, key_id, backend, caller, amount, destination,
		       correlation_id, digest, payload_digest, signature, outcome, reason, created_at, prev_hash, hash`

type scanner interface{ Scan(dest ...any) error }

func scan(row scanner) (Record, error) {
	var r Record
	err := row.Scan(&r.ID, &r.Chain, &r.Method, &r.KeyID, &r.Backend, &r.Caller, &r.Amount,
		&r.Destination, &r.CorrelationID, &r.Digest, &r.PayloadDigest, &r.Signature, &r.Outcome, &r.Reason,
		&r.CreatedAt, &r.PrevHash, &r.Hash)
	return r, err
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

// AuditStore is the audit_outbox Append writes into, for the relay that
// delivers it to services/audit-trail.
func (l *Log) AuditStore() *trail.Store { return trail.NewStore(l.db) }

// Audit-trail actions, one per outcome, so "every denial this month" is a
// filter on action rather than on a field inside the state.
const (
	TrailActionAllowed = "signer.signature.allowed"
	TrailActionDenied  = "signer.signature.denied"
	TrailActionError   = "signer.signature.error"
)

// trailEvent is r as services/audit-trail records it. The actor is the
// mTLS client identity, the same one the policy authorised. The event id is
// derived from the record id, so it is unique per row and stable across
// relay redeliveries. hash/prev_hash tie the event to this log's own chain:
// an auditor can check the signer's table against the trail, and a row
// removed from one is still in the other.
func trailEvent(r *Record) trail.Event {
	action, outcome := TrailActionError, trail.OutcomeFailure
	switch r.Outcome {
	case OutcomeAllowed:
		action, outcome = TrailActionAllowed, trail.OutcomeSuccess
	case OutcomeDenied:
		action, outcome = TrailActionDenied, trail.OutcomeDenied
	}
	actor := r.Caller
	if actor == "" {
		actor = "unauthenticated"
	}
	return trail.Event{
		ID:          "signer:" + r.ID,
		Actor:       actor,
		Action:      action,
		SubjectType: "SIGNATURE",
		SubjectID:   r.ID,
		Service:     "signer",
		Outcome:     outcome,
		AfterState: map[string]any{
			"chain":          r.Chain,
			"method":         r.Method,
			"key_id":         r.KeyID,
			"backend":        r.Backend,
			"amount":         r.Amount,
			"destination":    r.Destination,
			"correlation_id": r.CorrelationID,
			"digest":         r.Digest,
			"payload_digest": r.PayloadDigest,
			"outcome":        r.Outcome,
		},
		Metadata: map[string]any{
			"reason":    r.Reason,
			"hash":      r.Hash,
			"prev_hash": r.PrevHash,
		},
		OccurredAt: r.CreatedAt,
	}
}

// ErrAlreadySigned means these exact bytes have been signed under this
// (chain, method, correlation_id) already. The caller replays it rather than
// producing a second.
var ErrAlreadySigned = errors.New("already signed")

// ErrPayloadMismatch means this (chain, method, correlation_id) was already
// signed for a different payload. Checked again inside Append because two
// replicas can both pass the handler's Existing check concurrently.
var ErrPayloadMismatch = errors.New("correlation id already signed for a different payload")

// Existing returns a previous ALLOWED signature for this correlation, if one
// exists — the one over exactly digest if there is one, otherwise the
// earliest.
//
// This is the plan's *"idempotent on (chain, method, correlation_id) — a
// retried mint returns the original tx hash"*. Without it, a saga retry after
// a timeout produces a second valid signature for the same movement: the
// chain's replay guard stops the second transaction landing, but the platform
// has authorised the same money twice and which signature is the real one is
// unanswerable.
func (l *Log) Existing(ctx context.Context, chain, method, correlationID, digest string) (*Record, error) {
	if correlationID == "" {
		return nil, nil
	}
	r, err := scan(l.db.QueryRowContext(ctx, `
		SELECT `+columns+`
		  FROM signatures
		 WHERE chain = $1 AND method = $2 AND correlation_id = $3 AND outcome = 'ALLOWED'
		 ORDER BY (digest = $4) DESC, seq
		 LIMIT 1`, chain, method, correlationID, digest))
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

	// One payload per correlation id. Not expressible as a unique index —
	// re-signs of the same payload legitimately share the key — so it is
	// checked here, where SERIALIZABLE makes the read and the insert one step
	// against a concurrent Append on another replica.
	if r.Outcome == OutcomeAllowed && r.CorrelationID != "" {
		var bound string
		err = tx.QueryRowContext(ctx, `
			SELECT payload_digest FROM signatures
			 WHERE chain = $1 AND method = $2 AND correlation_id = $3 AND outcome = 'ALLOWED'
			 ORDER BY seq LIMIT 1`, r.Chain, r.Method, r.CorrelationID).Scan(&bound)
		switch {
		case errors.Is(err, sql.ErrNoRows):
		case err != nil:
			return err
		case bound == "" || bound != r.PayloadDigest:
			// An empty bound payload is a pre-00002 row: nothing records what
			// it authorised beyond its bytes, so nothing but those exact bytes
			// may follow it. Exact bytes are ErrAlreadySigned (a replay), not
			// a mismatch, whichever way the payload compares.
			var sameBytes bool
			if err := tx.QueryRowContext(ctx, `
				SELECT EXISTS (SELECT 1 FROM signatures
				 WHERE chain = $1 AND method = $2 AND correlation_id = $3 AND outcome = 'ALLOWED'
				   AND digest = $4)`, r.Chain, r.Method, r.CorrelationID, r.Digest).Scan(&sameBytes); err != nil {
				return err
			}
			if sameBytes {
				return ErrAlreadySigned
			}
			return ErrPayloadMismatch
		}
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
			 digest, payload_digest, signature, outcome, reason, created_at, prev_hash, hash)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
		r.ID, r.Chain, r.Method, r.KeyID, r.Backend, r.Caller, r.Amount, r.Destination,
		r.CorrelationID, r.Digest, r.PayloadDigest, r.Signature, r.Outcome, r.Reason, r.CreatedAt, r.PrevHash, r.Hash)
	if err != nil {
		if strings.Contains(err.Error(), "uq_signatures_idempotent") {
			return ErrAlreadySigned
		}
		return err
	}
	// The same record for services/audit-trail, in the same transaction: a
	// signature with no trail event, or an event for a signature that rolled
	// back, cannot exist.
	if _, err := trail.Enqueue(ctx, tx, trailEvent(r)); err != nil {
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
//
// Each correlation id counts once, however many times its payload was
// re-signed: a retry authorises the same money, not more of it. exclude
// leaves one correlation id out entirely, so a re-sign is checked as "the
// others plus this one" rather than counting itself twice.
func (l *Log) DailyTotal(ctx context.Context, chain, method, exclude string) (*big.Int, error) {
	rows, err := l.db.QueryContext(ctx, `
		SELECT amount FROM (
			SELECT DISTINCT ON (CASE WHEN correlation_id = '' THEN id ELSE correlation_id END) amount
			  FROM signatures
			 WHERE chain = $1 AND method = $2 AND outcome = 'ALLOWED'
			   AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
			   AND amount <> ''
			   AND ($3 = '' OR correlation_id <> $3)
			 ORDER BY CASE WHEN correlation_id = '' THEN id ELSE correlation_id END, seq
		) per_movement`, chain, method, exclude)
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
	rows, err := l.db.QueryContext(ctx, `SELECT `+columns+` FROM signatures ORDER BY seq`)
	if err != nil {
		return false, "", 0, err
	}
	defer rows.Close()

	expectedPrev := GenesisHash
	for rows.Next() {
		r, err := scan(rows)
		if err != nil {
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
	rows, err := l.db.QueryContext(ctx, `SELECT `+columns+` FROM signatures ORDER BY seq DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Record
	for rows.Next() {
		r, err := scan(rows)
		if err != nil {
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
//
// payload_digest (00002) is appended only when set. Rows written before it
// existed were hashed without it, and the append-only trigger means they can
// never be rehashed — so an empty value must hash exactly as it did then.
func hashOf(r *Record) string {
	fields := []string{
		r.PrevHash, r.ID, r.Chain, r.Method, r.KeyID, r.Backend, r.Caller,
		r.Amount, r.Destination, r.CorrelationID, r.Digest, r.Signature,
		r.Outcome, r.Reason, r.CreatedAt.UTC().Format(time.RFC3339Nano),
	}
	if r.PayloadDigest != "" {
		fields = append(fields, r.PayloadDigest)
	}
	h := sha256.New()
	for _, field := range fields {
		h.Write([]byte(field))
		h.Write([]byte{0x1f}) // unit separator
	}
	return hex.EncodeToString(h.Sum(nil))
}
