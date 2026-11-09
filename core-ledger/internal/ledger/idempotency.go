package ledger

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ---------------------------------------------------------------------------
// Idempotent response replay
//
// transactions.idempotency_key already stopped a retry from posting twice, but
// the retry still re-ran the handler, and everything the handler did around
// the posting ran again too: deriving a correlation id, inserting a saga row,
// rendering a response. On the issuance path that second insert hit a primary
// key and returned {"error":"internal error"} — a 500 from the one endpoint
// that mints money, in response to the retry that idempotency exists to make
// safe.
//
// A client that cannot tell whether money moved retries by hand. So the fix is
// not only to stop the 500: it is to make the second call return the first
// call's bytes, so there is nothing left to be unsure about.
// ---------------------------------------------------------------------------

type IdempotencyStatus string

const (
	IdempotencyInProgress IdempotencyStatus = "IN_PROGRESS"
	IdempotencyCompleted  IdempotencyStatus = "COMPLETED"
)

// StaleIdempotencyAfter is how long a claim may sit IN_PROGRESS before another
// request may take it over. Generous on purpose: a money-moving write that
// waits on chain finality is slow, and taking over from a request that is
// merely slow costs a duplicated handler run, while refusing to take over from
// one that is dead costs the client its key forever.
const StaleIdempotencyAfter = 15 * time.Minute

type IdempotencyRecord struct {
	Key         string            `gorm:"column:key;primaryKey"`
	Endpoint    string            `gorm:"column:endpoint"`
	RequestHash string            `gorm:"column:request_hash"`
	Status      IdempotencyStatus `gorm:"column:status"`

	StatusCode   *int       `gorm:"column:status_code"`
	ResponseBody []byte     `gorm:"column:response_body"`
	CreatedAt    time.Time  `gorm:"column:created_at;autoCreateTime"`
	CompletedAt  *time.Time `gorm:"column:completed_at"`
}

func (IdempotencyRecord) TableName() string { return "idempotency_records" }

// BeginIdempotent claims a key for this request, or reports what the key was
// already used for.
//
// A nil record means the caller owns the key and should proceed. A non-nil one
// means this exact request has been seen: COMPLETED carries the response to
// replay, IN_PROGRESS means the first call is still running.
//
// Reusing a key for a *different* request body is rejected rather than
// replayed. Silently returning the first call's response would tell a client
// that a transfer it never made had succeeded.
func (r *Repository) BeginIdempotent(ctx context.Context, key, endpoint, requestHash string) (*IdempotencyRecord, error) {
	if key == "" {
		return nil, postErr("MISSING_IDEMPOTENCY_KEY",
			"an Idempotency-Key header is required on every write, and must be reused when retrying")
	}

	rec := &IdempotencyRecord{
		Key:         key,
		Endpoint:    endpoint,
		RequestHash: requestHash,
		Status:      IdempotencyInProgress,
	}
	res := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "key"}}, DoNothing: true}).
		Create(rec)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 1 {
		return nil, nil
	}

	var existing IdempotencyRecord
	if err := r.db.WithContext(ctx).First(&existing, "key = ?", key).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// The row was deleted between the conflict and this read — a
			// concurrent request whose handler failed and released the key.
			// Treat it as contention rather than inventing a result.
			return nil, postErr("IDEMPOTENT_REQUEST_IN_PROGRESS",
				"another request is using idempotency key %s right now; retry shortly", key)
		}
		return nil, err
	}

	if existing.Endpoint != endpoint || existing.RequestHash != requestHash {
		return nil, postErr("IDEMPOTENCY_KEY_REUSED",
			"idempotency key %s was already used for a different request (%s); a new request needs a new key",
			key, existing.Endpoint)
	}

	// A record left IN_PROGRESS by a process that died mid-request would
	// otherwise make its key permanently unusable — and the retry that key
	// exists to make safe is exactly what the client will try next. So a
	// stale claim can be taken over.
	//
	// The compare-and-swap on created_at is what keeps two requests from both
	// taking over: the loser sees RowsAffected 0 and is told to wait. Taking
	// over cannot double-post in any case — transactions.idempotency_key is
	// unique, so the second run replays the first's journal entry rather than
	// writing a new one.
	if existing.Status == IdempotencyInProgress && time.Since(existing.CreatedAt) > StaleIdempotencyAfter {
		res := r.db.WithContext(ctx).Model(&IdempotencyRecord{}).
			Where("key = ? AND status = ? AND created_at = ?", key, IdempotencyInProgress, existing.CreatedAt).
			Update("created_at", time.Now().UTC())
		if res.Error != nil {
			return nil, res.Error
		}
		if res.RowsAffected == 1 {
			return nil, nil
		}
	}

	return &existing, nil
}

// CompleteIdempotent stores the response so a retry replays it byte for byte.
func (r *Repository) CompleteIdempotent(ctx context.Context, key string, statusCode int, body []byte) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&IdempotencyRecord{}).
		Where("key = ?", key).
		Updates(map[string]any{
			"status":        IdempotencyCompleted,
			"status_code":   statusCode,
			"response_body": body,
			"completed_at":  now,
		}).Error
}

// ReleaseIdempotent frees a key whose request failed in a way nobody should be
// held to. A 5xx means the outcome is unknown — pinning "unknown" to the key
// forever would make the retry that could have resolved it impossible.
func (r *Repository) ReleaseIdempotent(ctx context.Context, key string) error {
	return r.db.WithContext(ctx).
		Where("key = ? AND status = ?", key, IdempotencyInProgress).
		Delete(&IdempotencyRecord{}).Error
}
