// Package outbox owns the transactional outbox table.
//
// The point of the pattern, and the reason the write lives inside
// ledger.Repository.Post's SERIALIZABLE transaction rather than after it:
// "the journal was posted" and "an event was emitted about it" become the same
// commit. There is no window in which money moved and nobody downstream was
// told, and none in which a consumer acts on a transaction that was rolled
// back.
//
// This package deliberately does not import internal/ledger — the ledger
// builds the payload and calls Enqueue with the caller's *gorm.DB, which keeps
// the dependency one-way and lets the relay be tested without a chart of
// accounts.
package outbox

import (
	"context"
	"time"

	"gorm.io/gorm"
)

type Status string

const (
	StatusPending   Status = "PENDING"
	StatusPublished Status = "PUBLISHED"
	// StatusDead is a row whose attempt budget is spent. It stays in the table
	// forever: an event nobody could deliver is evidence, not garbage.
	StatusDead Status = "DEAD"
)

// Event is one row of the outbox.
//
// Payload is a string rather than []byte because the column is jsonb — a
// []byte would be handed to the driver as bytea and stored as an escaped blob
// that no consumer could query.
type Event struct {
	ID            int64  `gorm:"column:id;primaryKey;autoIncrement"`
	EventType     string `gorm:"column:event_type"`
	AggregateType string `gorm:"column:aggregate_type"`
	AggregateID   string `gorm:"column:aggregate_id"`
	Payload       string `gorm:"column:payload"`

	Status        Status    `gorm:"column:status"`
	Attempts      int       `gorm:"column:attempts"`
	NextAttemptAt time.Time `gorm:"column:next_attempt_at"`
	LastError     string    `gorm:"column:last_error"`

	CreatedAt   time.Time  `gorm:"column:created_at;autoCreateTime"`
	PublishedAt *time.Time `gorm:"column:published_at"`
}

func (Event) TableName() string { return "outbox_events" }

// Enqueue writes an event using the caller's transaction handle. It is the
// whole public write surface: there is no variant that opens its own
// transaction, because an outbox row committed separately from the state
// change it describes is worse than no outbox at all.
func Enqueue(tx *gorm.DB, e *Event) error {
	if e.Status == "" {
		e.Status = StatusPending
	}
	if e.NextAttemptAt.IsZero() {
		e.NextAttemptAt = time.Now().UTC()
	}
	return tx.Create(e).Error
}

type Store struct {
	db *gorm.DB
}

func NewStore(db *gorm.DB) *Store { return &Store{db: db} }

// Claim takes up to limit due events for this relay and nobody else.
//
// The whole claim is one statement on purpose. FOR UPDATE SKIP LOCKED inside
// the subquery makes concurrent relays step over each other's rows instead of
// blocking on them, and the enclosing UPDATE pushes next_attempt_at forward by
// visibility — so a relay that dies holding rows releases them on its
// transaction's rollback, and one that hangs releases them when the visibility
// window lapses. Neither needs Redis, etcd or a heartbeat.
func (s *Store) Claim(ctx context.Context, limit int, visibility time.Duration) ([]Event, error) {
	if limit <= 0 {
		limit = 100
	}
	var events []Event
	err := s.db.WithContext(ctx).Raw(`
		UPDATE outbox_events SET
			attempts        = attempts + 1,
			next_attempt_at = now() + make_interval(secs => ?)
		WHERE id IN (
			SELECT id FROM outbox_events
			WHERE status = 'PENDING' AND next_attempt_at <= now()
			ORDER BY next_attempt_at, id
			FOR UPDATE SKIP LOCKED
			LIMIT ?
		)
		RETURNING *`, visibilitySeconds(visibility), limit).Scan(&events).Error
	return events, err
}

// MarkPublished retires a delivered event.
func (s *Store) MarkPublished(ctx context.Context, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Model(&Event{}).
		Where("id IN ?", ids).
		Updates(map[string]any{
			"status":       StatusPublished,
			"published_at": time.Now().UTC(),
			"last_error":   "",
		}).Error
}

// Reschedule puts a failed event back in the queue after backoff.
func (s *Store) Reschedule(ctx context.Context, id int64, in time.Duration, cause string) error {
	return s.db.WithContext(ctx).Model(&Event{}).
		Where("id = ?", id).
		Updates(map[string]any{
			"next_attempt_at": time.Now().UTC().Add(in),
			"last_error":      truncate(cause, 2000),
		}).Error
}

// MarkDead retires an event whose attempt budget is spent.
func (s *Store) MarkDead(ctx context.Context, id int64, cause string) error {
	return s.db.WithContext(ctx).Model(&Event{}).
		Where("id = ?", id).
		Updates(map[string]any{
			"status":     StatusDead,
			"last_error": truncate(cause, 2000),
		}).Error
}

// PendingCount is what a relay exports as a gauge; a backlog that only grows
// is the first symptom of a consumer that has quietly stopped accepting.
func (s *Store) PendingCount(ctx context.Context) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&Event{}).Where("status = ?", StatusPending).Count(&n).Error
	return n, err
}

// visibilitySeconds feeds make_interval(secs => ...) rather than a cast of
// Duration.String(): Postgres reads "1h0m0s" with 'm' meaning months, which
// would hide a claimed row for a month instead of an hour.
func visibilitySeconds(d time.Duration) float64 {
	if d <= 0 {
		d = 30 * time.Second
	}
	return d.Seconds()
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
