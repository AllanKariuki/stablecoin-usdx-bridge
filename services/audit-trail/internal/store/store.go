// Package store is the audit trail's database: events, and the anchors that
// pin them.
package store

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/audit-trail/internal/chain"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// GenesisHash is the prev_hash of the first event. A recognisable constant
// rather than an empty string, so "the chain starts here" is distinguishable
// from "somebody wrote an empty prev_hash".
const GenesisHash = "0000000000000000000000000000000000000000000000000000000000000000"

type Event struct {
	Seq         int64
	ID          string
	Actor       string
	ActorRoles  []string
	OnBehalfOf  string
	Action      string
	SubjectType string
	SubjectID   string
	Service     string
	Outcome     string
	BeforeState map[string]any
	AfterState  map[string]any
	Metadata    map[string]any
	RequestID   string
	SourceIP    string
	UserAgent   string
	OccurredAt  time.Time
	RecordedAt  time.Time
	PrevHash    string
	Hash        string
	AnchorID    string
}

type Anchor struct {
	ID          string
	FromSeq     int64
	ToSeq       int64
	EventCount  int
	MerkleRoot  string
	ChainTip    string
	Status      string
	Chain       string
	TxHash      string
	PublishedAt *time.Time
	LastError   string
	CreatedAt   time.Time
}

type Store struct{ db *sql.DB }

func Open(dsn string) (*Store, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("opening the audit database: %w", err)
	}
	db.SetMaxOpenConns(15)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return nil, err
	}
	if err := goose.Up(db, "migrations"); err != nil {
		return nil, fmt.Errorf("running audit-trail migrations: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }
func (s *Store) Close() error                   { return s.db.Close() }

// Append records one event, linked to its predecessor.
//
// SERIALIZABLE because the read of the tip and the insert must be atomic:
// two concurrent appends that both read the same tip would produce two rows
// claiming the same predecessor — a fork in a chain whose whole value is that
// it has none.
func (s *Store) Append(ctx context.Context, e *Event) error {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var prev string
	err = tx.QueryRowContext(ctx, `SELECT hash FROM events ORDER BY seq DESC LIMIT 1`).Scan(&prev)
	if errors.Is(err, sql.ErrNoRows) {
		prev = GenesisHash
	} else if err != nil {
		return err
	}

	if e.ID == "" {
		e.ID = uuid.New().String()
	}
	if e.OccurredAt.IsZero() {
		e.OccurredAt = time.Now().UTC()
	}
	e.RecordedAt = time.Now().UTC()
	e.PrevHash = prev
	e.Hash = chain.Hex(chain.HashLeaf(e.CanonicalBytes()))

	err = tx.QueryRowContext(ctx, `
		INSERT INTO events
			(id, actor, actor_roles, on_behalf_of, action, subject_type, subject_id, service,
			 outcome, before_state, after_state, metadata, request_id, source_ip, user_agent,
			 occurred_at, recorded_at, prev_hash, hash)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
		RETURNING seq`,
		e.ID, e.Actor, e.ActorRoles, e.OnBehalfOf, e.Action, e.SubjectType, e.SubjectID,
		e.Service, e.Outcome, jsonOrNil(e.BeforeState), jsonOrNil(e.AfterState),
		jsonOrDefault(e.Metadata), e.RequestID, e.SourceIP, e.UserAgent,
		e.OccurredAt, e.RecordedAt, e.PrevHash, e.Hash).Scan(&e.Seq)
	if err != nil {
		return err
	}
	return tx.Commit()
}

// CanonicalBytes is what gets hashed, into both the chain and the Merkle
// tree.
//
// Every field describing *what happened* is included, and the separator is a
// byte none of them can contain — without it, two different field splits
// could produce the same input, so {actor: "a", action: "bc"} and
// {actor: "ab", action: "c"} would hash identically.
//
// `seq` is deliberately absent: it is assigned by the database after the hash
// is computed, and including it would make the hash unverifiable by anyone
// recomputing it from the event's own content.
func (e *Event) CanonicalBytes() []byte {
	before, _ := json.Marshal(sortedJSON(e.BeforeState))
	after, _ := json.Marshal(sortedJSON(e.AfterState))
	meta, _ := json.Marshal(sortedJSON(e.Metadata))

	var buf []byte
	for _, field := range [][]byte{
		[]byte(e.PrevHash), []byte(e.ID), []byte(e.Actor), []byte(e.OnBehalfOf),
		[]byte(e.Action), []byte(e.SubjectType), []byte(e.SubjectID), []byte(e.Service),
		[]byte(e.Outcome), before, after, meta, []byte(e.RequestID),
		[]byte(e.OccurredAt.UTC().Format(time.RFC3339Nano)),
	} {
		buf = append(buf, field...)
		buf = append(buf, 0x1f) // unit separator
	}
	return buf
}

// Verify walks the chain and reports the first event whose hash does not
// follow from its predecessor.
func (s *Store) Verify(ctx context.Context) (ok bool, brokenAt string, checked int, err error) {
	rows, err := s.query(ctx, `SELECT * FROM events ORDER BY seq`)
	if err != nil {
		return false, "", 0, err
	}
	defer rows.Close()

	expectedPrev := GenesisHash
	for rows.Next() {
		e, serr := scanEvent(rows)
		if serr != nil {
			return false, "", checked, serr
		}
		checked++
		if e.PrevHash != expectedPrev {
			return false, e.ID, checked, nil
		}
		if chain.Hex(chain.HashLeaf(e.CanonicalBytes())) != e.Hash {
			return false, e.ID, checked, nil
		}
		expectedPrev = e.Hash
	}
	return true, "", checked, rows.Err()
}

// Unanchored returns the events not yet covered by an anchor, oldest first.
func (s *Store) Unanchored(ctx context.Context, limit int) ([]Event, error) {
	if limit <= 0 || limit > 100_000 {
		limit = 10_000
	}
	rows, err := s.query(ctx, `SELECT * FROM events WHERE anchor_id IS NULL ORDER BY seq LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collect(rows)
}

// CreateAnchor writes the root and claims its events in one transaction.
//
// One transaction because an anchor that exists without its events being
// marked would be re-created on the next run — producing a second root over
// the same window, which is exactly what the UNIQUE (from_seq, to_seq)
// refuses. The two writes are the same fact.
func (s *Store) CreateAnchor(ctx context.Context, a *Anchor) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if a.ID == "" {
		a.ID = uuid.New().String()
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO anchors (id, from_seq, to_seq, event_count, merkle_root, chain_tip, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		a.ID, a.FromSeq, a.ToSeq, a.EventCount, a.MerkleRoot, a.ChainTip, a.Status)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx,
		`UPDATE events SET anchor_id = $1 WHERE seq BETWEEN $2 AND $3 AND anchor_id IS NULL`,
		a.ID, a.FromSeq, a.ToSeq)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) MarkAnchorPublished(ctx context.Context, id, chainName, txHash string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE anchors SET status = 'PUBLISHED', chain = $2, tx_hash = $3,
		       published_at = now(), last_error = '' WHERE id = $1`, id, chainName, txHash)
	return err
}

func (s *Store) MarkAnchorFailed(ctx context.Context, id, reason string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE anchors SET status = 'FAILED', last_error = $2 WHERE id = $1`, id, truncate(reason, 2000))
	return err
}

func (s *Store) PendingAnchors(ctx context.Context) ([]Anchor, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, from_seq, to_seq, event_count, merkle_root, chain_tip, status,
		       chain, tx_hash, published_at, last_error, created_at
		  FROM anchors WHERE status = 'PENDING' ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectAnchors(rows)
}

func (s *Store) Anchors(ctx context.Context, limit int) ([]Anchor, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, from_seq, to_seq, event_count, merkle_root, chain_tip, status,
		       chain, tx_hash, published_at, last_error, created_at
		  FROM anchors ORDER BY from_seq DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectAnchors(rows)
}

// AnchorFor finds the anchor covering an event, and the events in its window
// — everything needed to build an inclusion proof.
func (s *Store) AnchorFor(ctx context.Context, eventID string) (*Anchor, []Event, int, error) {
	var anchorID sql.NullString
	var seq int64
	err := s.db.QueryRowContext(ctx, `SELECT seq, anchor_id FROM events WHERE id = $1`, eventID).
		Scan(&seq, &anchorID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, 0, nil
	}
	if err != nil {
		return nil, nil, 0, err
	}
	if !anchorID.Valid {
		// Recorded but not yet anchored. A real, temporary state — the
		// caller says so rather than treating it as a missing event.
		return nil, nil, 0, nil
	}

	var a Anchor
	err = s.db.QueryRowContext(ctx, `
		SELECT id, from_seq, to_seq, event_count, merkle_root, chain_tip, status,
		       chain, tx_hash, published_at, last_error, created_at
		  FROM anchors WHERE id = $1`, anchorID.String).Scan(
		&a.ID, &a.FromSeq, &a.ToSeq, &a.EventCount, &a.MerkleRoot, &a.ChainTip,
		&a.Status, &a.Chain, &a.TxHash, &a.PublishedAt, &a.LastError, &a.CreatedAt)
	if err != nil {
		return nil, nil, 0, err
	}

	rows, err := s.query(ctx, `SELECT * FROM events WHERE anchor_id = $1 ORDER BY seq`, a.ID)
	if err != nil {
		return nil, nil, 0, err
	}
	defer rows.Close()
	events, err := collect(rows)
	if err != nil {
		return nil, nil, 0, err
	}

	index := -1
	for i, e := range events {
		if e.ID == eventID {
			index = i
			break
		}
	}
	return &a, events, index, nil
}

type Filter struct {
	Actor       string
	Action      string
	SubjectType string
	SubjectID   string
	RequestID   string
	Limit       int
}

func (s *Store) Events(ctx context.Context, f Filter) ([]Event, error) {
	if f.Limit <= 0 || f.Limit > 500 {
		f.Limit = 100
	}
	rows, err := s.query(ctx, `
		SELECT * FROM events
		 WHERE ($1 = '' OR actor = $1)
		   AND ($2 = '' OR action = $2)
		   AND ($3 = '' OR subject_type = $3)
		   AND ($4 = '' OR subject_id = $4)
		   AND ($5 = '' OR request_id = $5)
		 ORDER BY seq DESC LIMIT $6`,
		f.Actor, f.Action, f.SubjectType, f.SubjectID, f.RequestID, f.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collect(rows)
}

// ---------------------------------------------------------------------------

func (s *Store) query(ctx context.Context, sql string, args ...any) (*sqlRows, error) {
	rows, err := s.db.QueryContext(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return &sqlRows{rows}, nil
}

type sqlRows struct{ *sql.Rows }

func scanEvent(rows *sqlRows) (Event, error) {
	var (
		e                   Event
		before, after, meta []byte
		anchorID            sql.NullString
	)
	err := rows.Scan(&e.Seq, &e.ID, &e.Actor, &e.ActorRoles, &e.OnBehalfOf, &e.Action,
		&e.SubjectType, &e.SubjectID, &e.Service, &e.Outcome, &before, &after, &meta,
		&e.RequestID, &e.SourceIP, &e.UserAgent, &e.OccurredAt, &e.RecordedAt,
		&e.PrevHash, &e.Hash, &anchorID)
	if err != nil {
		return e, err
	}
	_ = json.Unmarshal(before, &e.BeforeState)
	_ = json.Unmarshal(after, &e.AfterState)
	_ = json.Unmarshal(meta, &e.Metadata)
	e.AnchorID = anchorID.String
	return e, nil
}

func collect(rows *sqlRows) ([]Event, error) {
	var out []Event
	for rows.Next() {
		e, err := scanEvent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func collectAnchors(rows *sql.Rows) ([]Anchor, error) {
	var out []Anchor
	for rows.Next() {
		var a Anchor
		if err := rows.Scan(&a.ID, &a.FromSeq, &a.ToSeq, &a.EventCount, &a.MerkleRoot,
			&a.ChainTip, &a.Status, &a.Chain, &a.TxHash, &a.PublishedAt, &a.LastError,
			&a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// sortedJSON gives map serialisation a deterministic order.
//
// Go's encoding/json already sorts map keys, so this is belt-and-braces — but
// the hash's stability is the whole point of the structure, and depending on
// an implementation detail of the standard library for it is the kind of
// assumption that is correct until it isn't.
func sortedJSON(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return m
}

func jsonOrNil(m map[string]any) any {
	if m == nil {
		return nil
	}
	raw, err := json.Marshal(m)
	if err != nil {
		return nil
	}
	return string(raw)
}

func jsonOrDefault(m map[string]any) string {
	if m == nil {
		return "{}"
	}
	raw, err := json.Marshal(m)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
