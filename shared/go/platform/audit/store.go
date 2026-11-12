package audit

import (
	"context"
	"database/sql"
	"time"
)

// Pending is one claimed outbox row.
type Pending struct {
	ID       int64
	EventID  string
	Action   string
	Payload  string
	Attempts int
}

// Store is the relay's side of the table.
type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

// Claim takes up to limit due rows for this relay and nobody else.
//
// One statement, the shape core-ledger's outbox.Claim uses and for the same
// reasons: SKIP LOCKED makes concurrent relays step over each other's rows
// rather than queue on them, and pushing next_attempt_at forward by the
// visibility window means a relay that dies or hangs holding rows releases
// them without a heartbeat. Two relays delivering one row anyway — after a
// hang longer than the window — is harmless, because audit-trail records an
// event id once.
func (s *Store) Claim(ctx context.Context, limit int, visibility time.Duration) ([]Pending, error) {
	if limit <= 0 {
		limit = 100
	}
	if visibility <= 0 {
		visibility = 30 * time.Second
	}
	rows, err := s.db.QueryContext(ctx, `
		UPDATE audit_outbox SET
			attempts        = attempts + 1,
			-- make_interval(secs => ...) rather than a cast of a Go duration
			-- string: Postgres reads the m in "1m0s" as months.
			next_attempt_at = now() + make_interval(secs => $2)
		WHERE id IN (
			SELECT id FROM audit_outbox
			WHERE status = 'PENDING' AND next_attempt_at <= now()
			ORDER BY next_attempt_at, id
			FOR UPDATE SKIP LOCKED
			LIMIT $1
		)
		RETURNING id, event_id, action, payload::text, attempts`,
		limit, visibility.Seconds())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Pending
	for rows.Next() {
		var p Pending
		if err := rows.Scan(&p.ID, &p.EventID, &p.Action, &p.Payload, &p.Attempts); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) MarkDelivered(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE audit_outbox SET status = 'DELIVERED', delivered_at = now(), last_error = ''
		 WHERE id = $1`, id)
	return err
}

func (s *Store) Reschedule(ctx context.Context, id int64, in time.Duration, cause string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE audit_outbox SET next_attempt_at = now() + make_interval(secs => $2), last_error = $3
		 WHERE id = $1`, id, in.Seconds(), truncate(cause, 2000))
	return err
}

// MarkDead retires a row audit-trail refused outright. It is never deleted:
// an event the trail would not take is itself evidence of something, and the
// dead-letter counter is what pages a human to look.
func (s *Store) MarkDead(ctx context.Context, id int64, cause string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE audit_outbox SET status = 'DEAD', last_error = $2 WHERE id = $1`, id, truncate(cause, 2000))
	return err
}

func (s *Store) PendingCount(ctx context.Context) (int64, error) {
	var n int64
	err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM audit_outbox WHERE status = 'PENDING'`).Scan(&n)
	return n, err
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
