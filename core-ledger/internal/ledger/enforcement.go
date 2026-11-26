package ledger

// H6: the durable, asynchronous half of compliance enforcement.
//
// POST /chain/enforcement records one row per compliance action and returns
// 202 as soon as the transaction is broadcast; the worker's sweep observes
// finality and finalizes the row (see internal/enforcement). Everything the
// HTTP route and the sweep do against the chain flows through these methods,
// which is what makes the two processes safe against each other: the row is
// the shared truth, the reference is its key, and the outbox event is
// enqueued in the same transaction that finalizes it.

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/outbox"

	"gorm.io/gorm"
)

// EventChainEnforcementFinalized is what compliance consumes (its ingest
// handler) once an enforcement transaction has reached finality — or has
// failed on chain. The damp.<domain>.<event>.v1 subject shape matches every
// other ledger event.
const EventChainEnforcementFinalized = "damp.ledger.chain_enforcement_finalized.v1"

const aggregateEnforcement = "ENFORCEMENT_ACTION"

type EnforcementStatus string

const (
	EnforcementSubmitted EnforcementStatus = "SUBMITTED"
	EnforcementFinal     EnforcementStatus = "FINAL"
	EnforcementFailed    EnforcementStatus = "FAILED"
)

// ChainEnforcement is one compliance enforcement action's on-chain journey.
// Reference is the compliance action id — the primary key is the dedupe that
// makes a retried POST safe even without the idempotency middleware.
type ChainEnforcement struct {
	Reference     string    `gorm:"column:reference;primaryKey"`
	Action        string    `gorm:"column:action"`
	Chain         string    `gorm:"column:chain"`
	Address       string    `gorm:"column:address"`
	TxHash        string    `gorm:"column:tx_hash"`
	Status        string    `gorm:"column:status"`
	FailureReason string    `gorm:"column:failure_reason"`
	RequestedBy   string    `gorm:"column:requested_by"`
	OnBehalfOf    string    `gorm:"column:on_behalf_of"`
	Attempts      int       `gorm:"column:attempts"`
	NextCheckAt   time.Time `gorm:"column:next_check_at"`
	CreatedAt     time.Time `gorm:"column:created_at"`
	UpdatedAt     time.Time `gorm:"column:updated_at"`
}

func (ChainEnforcement) TableName() string { return "chain_enforcements" }

// chainEnforcementFinalizedPayload is a public contract the moment the relay
// posts it, so it is written out explicitly — compliance's ingest handler
// reads these exact fields.
type chainEnforcementFinalizedPayload struct {
	Reference     string `json:"reference"`
	Action        string `json:"action"`
	Chain         string `json:"chain"`
	Address       string `json:"address"`
	TxHash        string `json:"tx_hash"`
	Status        string `json:"status"`
	FailureReason string `json:"failure_reason,omitempty"`
}

// enqueueEnforcementFinalized writes the outbox row inside the caller's
// transaction — the same commit that flips the row's status, so there is no
// window in which the chain state is known and compliance was not told.
func enqueueEnforcementFinalized(tx *gorm.DB, row *ChainEnforcement, status EnforcementStatus, failureReason string) error {
	payload, err := json.Marshal(chainEnforcementFinalizedPayload{
		Reference:     row.Reference,
		Action:        row.Action,
		Chain:         row.Chain,
		Address:       row.Address,
		TxHash:        row.TxHash,
		Status:        string(status),
		FailureReason: failureReason,
	})
	if err != nil {
		return err
	}
	return outbox.Enqueue(tx, &outbox.Event{
		EventType:     EventChainEnforcementFinalized,
		AggregateType: aggregateEnforcement,
		AggregateID:   row.Reference,
		Payload:       string(payload),
	})
}

// CreateChainEnforcement records the action BEFORE the transaction is
// submitted. The row is the dedupe: a retried request finds it and never
// submits again.
func (r *Repository) CreateChainEnforcement(ctx context.Context, e *ChainEnforcement) error {
	return r.db.WithContext(ctx).Create(e).Error
}

// ChainEnforcementByReference loads one row. gorm.ErrRecordNotFound when the
// reference was never seen.
func (r *Repository) ChainEnforcementByReference(ctx context.Context, reference string) (*ChainEnforcement, error) {
	var e ChainEnforcement
	err := r.db.WithContext(ctx).First(&e, "reference = ?", reference).Error
	if err != nil {
		return nil, err
	}
	return &e, nil
}

// StoreChainEnforcementTxHash records the broadcast transaction. It only ever
// runs once per row — the handler never overwrites a hash.
func (r *Repository) StoreChainEnforcementTxHash(ctx context.Context, reference, txHash string) error {
	res := r.db.WithContext(ctx).Model(&ChainEnforcement{}).
		Where("reference = ? AND tx_hash = ''", reference).
		Updates(map[string]any{"tx_hash": txHash, "updated_at": time.Now().UTC()})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("enforcement %s already carries a transaction hash; refusing to overwrite it", reference)
	}
	return nil
}

// FailChainEnforcement marks the row FAILED without an outbox event. It is
// the submit-stage failure path: the HTTP caller is still on the line and
// learns the outcome from the 409, so there is no consumer to notify.
func (r *Repository) FailChainEnforcement(ctx context.Context, reference, reason string) error {
	return r.db.WithContext(ctx).Model(&ChainEnforcement{}).
		Where("reference = ?", reference).
		Updates(map[string]any{
			"status":         string(EnforcementFailed),
			"failure_reason": truncateReason(reason),
			"updated_at":     time.Now().UTC(),
		}).Error
}

// DeleteChainEnforcement removes a row that never got a transaction hash —
// the only state in which a resubmission is safe. A row WITH a hash is never
// deleted: the transaction may be in flight or mined, and resubmitting under
// the same reference would double-execute the action.
func (r *Repository) DeleteChainEnforcement(ctx context.Context, reference string) error {
	return r.db.WithContext(ctx).
		Where("reference = ? AND tx_hash = ''", reference).
		Delete(&ChainEnforcement{}).Error
}

// FinalizeChainEnforcement flips the row to its terminal status and enqueues
// the outbox event compliance consumes, in one transaction. final is true for
// FINAL, false for FAILED (with the reason). The UPDATE takes the row lock
// inside the transaction, so two sweeps cannot finalize the same row twice
// (and enqueue two events) when a lease lapsed.
func (r *Repository) FinalizeChainEnforcement(ctx context.Context, reference string, final bool, reason string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var row ChainEnforcement
		if err := tx.First(&row, "reference = ?", reference).Error; err != nil {
			return err
		}
		status := EnforcementFailed
		if final {
			status = EnforcementFinal
			reason = ""
		}
		if err := tx.Model(&ChainEnforcement{}).Where("reference = ?", reference).Updates(map[string]any{
			"status":         string(status),
			"failure_reason": truncateReason(reason),
			"updated_at":     time.Now().UTC(),
		}).Error; err != nil {
			return err
		}
		return enqueueEnforcementFinalized(tx, &row, status, reason)
	})
}

// ClaimChainEnforcements takes due rows (SUBMITTED, with a hash, past their
// next_check_at) for this sweep and nobody else — the outbox's claim shape:
// FOR UPDATE SKIP LOCKED inside the subquery, and next_check_at pushed
// forward by the lease so a sweep that dies releases its rows when they lapse.
// attempts is incremented per claim; the sweep's budget check reads it.
func (r *Repository) ClaimChainEnforcements(ctx context.Context, limit int, lease time.Duration) ([]ChainEnforcement, error) {
	if limit <= 0 {
		limit = 10
	}
	var rows []ChainEnforcement
	err := r.db.WithContext(ctx).Raw(`
		UPDATE chain_enforcements SET
			attempts        = attempts + 1,
			next_check_at   = now() + make_interval(secs => ?),
			updated_at      = now()
		WHERE reference IN (
			SELECT reference FROM chain_enforcements
			WHERE status = 'SUBMITTED' AND tx_hash <> '' AND next_check_at <= now()
			ORDER BY next_check_at, reference
			FOR UPDATE SKIP LOCKED
			LIMIT ?
		)
		RETURNING *`, lease.Seconds(), limit).Scan(&rows).Error
	return rows, err
}

func truncateReason(s string) string {
	const max = 2000
	if len(s) <= max {
		return s
	}
	return s[:max]
}
