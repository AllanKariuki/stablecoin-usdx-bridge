package ledger

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/outbox"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ---------------------------------------------------------------------------
// Saga durability
//
// Everything in this file exists to replace one line — `go saga.Execute(id)` —
// with state a restarted process can pick up. The queue is the
// bridge_transfers table itself: claimed with SELECT … FOR UPDATE SKIP LOCKED
// under a lease, so N worker replicas are safe against each other with no
// Redis, no etcd and no leader election, and a worker that is SIGKILLed loses
// nothing but the remainder of its lease.
// ---------------------------------------------------------------------------

// OutboxStore hands the relay a store over the same connection pool without
// exposing the repository's *gorm.DB to everything that imports this package.
func (r *Repository) OutboxStore() *outbox.Store { return outbox.NewStore(r.db) }

// UpsertTransfer inserts a saga, or returns the existing one if this
// correlation id has already been enqueued.
//
// This is the fix for the retried-issuance 500: the old Insert was a bare
// Create against a primary key, so the second identical POST — which derives
// the same correlation id from the same idempotency key, on purpose — hit a
// duplicate-key violation and returned "internal error" from the one endpoint
// that mints money.
func (r *Repository) UpsertTransfer(ctx context.Context, t *BridgeTransfer) (*BridgeTransfer, error) {
	if !t.Kind.Valid() {
		return nil, postErr("INVALID_SAGA_KIND", "unknown saga kind %q", t.Kind)
	}
	if t.Status == "" {
		t.Status = StatusPending
	}
	if t.NextAttemptAt.IsZero() {
		t.NextAttemptAt = time.Now().UTC()
	}

	// DoNothing, not DoUpdates: a second POST with the same idempotency key is
	// a retry of the same instruction, not an amendment of it. Letting it
	// rewrite amount or destination would turn idempotency into a silent edit
	// of money already in flight.
	err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "correlation_id"}}, DoNothing: true}).
		Create(t).Error
	if err != nil {
		return nil, err
	}
	return r.FindByCorrelationID(t.CorrelationID)
}

// ClaimTransfer leases one due saga to owner, or returns nil when there is
// nothing to do.
//
// SKIP LOCKED is what makes this safe to run from N replicas: a row another
// worker is claiming right now is stepped over rather than waited on, so
// workers never serialize behind each other and never hand the same saga to
// two goroutines. The lease is a second, independent guard for the case the
// lock cannot cover — a worker that was SIGKILLed after committing its claim.
func (r *Repository) ClaimTransfer(ctx context.Context, owner string, lease time.Duration) (*BridgeTransfer, error) {
	var claimed *BridgeTransfer

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var correlationID string
		row := tx.Raw(`
			SELECT correlation_id FROM bridge_transfers
			WHERE status IN ('PENDING', 'BURN_CONFIRMED', 'MINT_SUBMITTED')
			  AND next_attempt_at <= now()
			  AND (lease_expires_at IS NULL OR lease_expires_at < now())
			  -- A saga parked for a human is not a saga to keep retrying.
			  -- Resolving its dead letter is what puts it back in the queue.
			  AND NOT EXISTS (
			      SELECT 1 FROM saga_dead_letters dl
			      WHERE dl.correlation_id = bridge_transfers.correlation_id
			        AND dl.resolved_at IS NULL
			  )
			ORDER BY next_attempt_at, correlation_id
			FOR UPDATE SKIP LOCKED
			LIMIT 1`).Row()
		if err := row.Scan(&correlationID); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) || err.Error() == "sql: no rows in result set" {
				return nil
			}
			return err
		}

		err := tx.Model(&BridgeTransfer{}).
			Where("correlation_id = ?", correlationID).
			Updates(map[string]any{
				"lease_owner":      owner,
				"lease_expires_at": time.Now().UTC().Add(lease),
				"attempts":         gorm.Expr("attempts + 1"),
			}).Error
		if err != nil {
			return err
		}

		var t BridgeTransfer
		if err := tx.First(&t, "correlation_id = ?", correlationID).Error; err != nil {
			return err
		}
		claimed = &t
		return nil
	})
	if err != nil {
		return nil, err
	}
	return claimed, nil
}

// TransferForLedgerTx finds the saga that settles a given journal
// transaction — the lookup the operator break-glass route needs to mark a
// hand-settled redemption done so the worker doesn't burn it a second time.
func (r *Repository) TransferForLedgerTx(ctx context.Context, ledgerTxID string) (*BridgeTransfer, error) {
	var t BridgeTransfer
	if err := r.db.WithContext(ctx).First(&t, "ledger_tx_id = ?", ledgerTxID).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

// ExtendLease is the worker's heartbeat. A chain call can outlast any lease
// you would be willing to set as a crash-detection timeout, so the lease is
// kept short and renewed rather than set long and hoped about.
//
// The owner check means a worker that was declared dead and had its saga
// re-claimed cannot silently take it back by heartbeating.
func (r *Repository) ExtendLease(ctx context.Context, correlationID, owner string, lease time.Duration) error {
	res := r.db.WithContext(ctx).Model(&BridgeTransfer{}).
		Where("correlation_id = ? AND lease_owner = ?", correlationID, owner).
		Update("lease_expires_at", time.Now().UTC().Add(lease))
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("lease on %s is no longer held by %s", correlationID, owner)
	}
	return nil
}

// ReleaseTransfer drops the lease and schedules the next attempt.
func (r *Repository) ReleaseTransfer(ctx context.Context, correlationID string, in time.Duration, cause string) error {
	return r.db.WithContext(ctx).Model(&BridgeTransfer{}).
		Where("correlation_id = ?", correlationID).
		Updates(map[string]any{
			"lease_owner":      "",
			"lease_expires_at": nil,
			"next_attempt_at":  time.Now().UTC().Add(in),
			"last_error":       truncateError(cause),
		}).Error
}

// SettleTransfer records a terminal outcome and drops the lease, so nothing
// re-claims a saga that is finished.
func (r *Repository) SettleTransfer(ctx context.Context, correlationID string, status TransferStatus, cause string) error {
	return r.db.WithContext(ctx).Model(&BridgeTransfer{}).
		Where("correlation_id = ?", correlationID).
		Updates(map[string]any{
			"status":           status,
			"lease_owner":      "",
			"lease_expires_at": nil,
			"last_error":       truncateError(cause),
		}).Error
}

// RecordChainTx stores the hash of a chain call the saga made. Neither hash
// column had a writer before: GET /transfers/{id} rendered source_tx_hash and
// dest_tx_hash from a row nothing ever populated, so the one piece of evidence
// an operator needs to look a stuck transfer up on Etherscan was never kept.
func (r *Repository) RecordChainTx(ctx context.Context, correlationID string, column string, txHash string) error {
	if column != "source_tx_hash" && column != "dest_tx_hash" {
		return fmt.Errorf("RecordChainTx: %q is not a chain tx hash column", column)
	}
	return r.db.WithContext(ctx).Model(&BridgeTransfer{}).
		Where("correlation_id = ?", correlationID).
		Update(column, txHash).Error
}

// SweepInFlight is what a worker runs on boot: every saga that was mid-flight
// when the last process died becomes immediately claimable again, ahead of
// whatever backoff it was sitting out.
//
// This is the caller InFlight() was documented as having and never had. The
// lease predicate matters — a saga another live worker is holding right now
// must not be yanked forward under it.
func (r *Repository) SweepInFlight(ctx context.Context) ([]BridgeTransfer, error) {
	stranded, err := r.InFlight()
	if err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(stranded))
	for _, t := range stranded {
		ids = append(ids, t.CorrelationID)
	}
	if len(ids) == 0 {
		return nil, nil
	}

	err = r.db.WithContext(ctx).Model(&BridgeTransfer{}).
		Where("correlation_id IN ?", ids).
		Where("lease_expires_at IS NULL OR lease_expires_at < now()").
		Updates(map[string]any{
			"next_attempt_at": time.Now().UTC(),
			"lease_owner":     "",
		}).Error
	if err != nil {
		return nil, err
	}
	return stranded, nil
}

// DeadLetter parks a saga whose attempt budget is spent. The transfer's own
// status is left alone: whether the money is FAILED, COMPENSATED or still
// stuck mid-flight is a separate question from whether a human has to look at
// it, and collapsing the two loses the one that matters for recovery.
func (r *Repository) DeadLetter(ctx context.Context, t *BridgeTransfer, stage, cause string) error {
	dl := &SagaDeadLetter{
		CorrelationID: t.CorrelationID,
		Kind:          t.Kind,
		Stage:         stage,
		Attempts:      t.Attempts,
		LastError:     truncateError(cause),
	}
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "correlation_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"kind", "stage", "attempts", "last_error", "failed_at",
		}),
	}).Create(dl).Error
}

// OpenDeadLetters is the operator's queue.
func (r *Repository) OpenDeadLetters(ctx context.Context, limit int) ([]SagaDeadLetter, error) {
	var out []SagaDeadLetter
	err := r.db.WithContext(ctx).
		Where("resolved_at IS NULL").
		Order("failed_at").Limit(limit).Find(&out).Error
	return out, err
}

// ResolveDeadLetter closes an entry once a human has dealt with it, and hands
// the saga back to the workers with a fresh attempt budget if it never reached
// a terminal state. Resolving is therefore the operator's "try again" as well
// as their "I've handled it" — one action, because in practice they are the
// same action: whatever was broken has been fixed.
func (r *Repository) ResolveDeadLetter(ctx context.Context, correlationID, by, resolution string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&SagaDeadLetter{}).
			Where("correlation_id = ? AND resolved_at IS NULL", correlationID).
			Updates(map[string]any{
				"resolved_at": time.Now().UTC(),
				"resolved_by": by,
				"resolution":  resolution,
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return postErr("NO_OPEN_DEAD_LETTER", "no open dead letter for saga %s", correlationID)
		}

		return tx.Model(&BridgeTransfer{}).
			Where("correlation_id = ?", correlationID).
			Where("status IN ?", []TransferStatus{StatusPending, StatusBurnConfirmed, StatusMintSubmitted}).
			Updates(map[string]any{
				"attempts":         0,
				"next_attempt_at":  time.Now().UTC(),
				"lease_owner":      "",
				"lease_expires_at": nil,
			}).Error
	})
}

// WithAdvisoryLock runs fn while holding a Postgres session-level advisory
// lock keyed on name, reporting whether the lock was acquired at all.
//
// The lease already stops two workers claiming one saga; this stops the case
// the lease cannot see — the same process running Execute twice for one
// correlation id (a boot sweep racing the claim loop, an operator-triggered
// replay landing on top of a scheduled attempt). It lives in Postgres rather
// than in a lock service on purpose: the lock is in the same system as the
// money, so it can't be held by a process that has lost its database
// connection, and it fails closed by construction.
func (r *Repository) WithAdvisoryLock(ctx context.Context, name string, fn func() error) (bool, error) {
	sqlDB, err := r.db.DB()
	if err != nil {
		return false, err
	}
	// The lock is scoped to a session, so it has to be taken and released on
	// one pinned connection — taking it on a pooled handle would release it on
	// whichever connection the pool happened to hand back.
	conn, err := sqlDB.Conn(ctx)
	if err != nil {
		return false, err
	}
	defer conn.Close()

	var acquired bool
	if err := conn.QueryRowContext(ctx,
		`SELECT pg_try_advisory_lock(hashtextextended($1, 0))`, name).Scan(&acquired); err != nil {
		return false, err
	}
	if !acquired {
		return false, nil
	}
	defer func() {
		_, _ = conn.ExecContext(context.WithoutCancel(ctx),
			`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, name)
	}()

	return true, fn()
}

func truncateError(s string) string {
	const max = 2000
	if len(s) <= max {
		return s
	}
	return s[:max]
}
