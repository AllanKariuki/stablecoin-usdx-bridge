package ledger

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/audit"

	"gorm.io/gorm"
)

// auditService is the `service` every core-ledger audit event carries.
const auditService = "core-ledger"

// Audit actions core-ledger emits. Dotted <domain>.<object>.<verb>, the shape
// services/audit-trail's schema documents; they are what an auditor filters
// on, so they are a contract in the same way the outbox event types are.
const (
	AuditTransactionPosted   = "ledger.transaction.posted"
	AuditTransactionReversed = "ledger.transaction.reversed"
	AuditManualJournalPosted = "ledger.journal.manual_posted"
	AuditWalletStatusChanged = "ledger.wallet.status_changed"
	AuditPeriodClosed        = "ledger.period.closed"
	AuditDeadLetterResolved  = "ledger.saga.dead_letter_resolved"
	auditSystemActorFallback = "system:core-ledger"
	auditSubjectTransaction  = "TRANSACTION"
	auditSubjectWallet       = "WALLET"
	auditSubjectClosure      = "LEDGER_CLOSURE"
	auditSubjectSaga         = "BRIDGE_SAGA"
)

// enqueueAudit writes an audit event on the GORM transaction tx.
//
// tx.Statement.ConnPool inside db.Transaction(...) is the *sql.Tx itself, so
// the row commits or rolls back with whatever tx is writing — which is the
// whole guarantee. Outside one the row would commit on its own, so that is
// refused rather than quietly allowed.
//
// The context is the request's (fiber's c.Context(), carrying what
// audit.Middleware captured); tx's own context is the same one, via
// db.WithContext.
func enqueueAudit(ctx context.Context, tx *gorm.DB, e audit.Event) error {
	pool := tx.Statement.ConnPool
	if _, ok := pool.(*sql.Tx); !ok {
		// Defensive: a ConnPool that is not a transaction means this was
		// reached outside db.Transaction, and the event would commit on its
		// own. Refuse rather than write evidence that is not tied to the
		// action.
		return errors.New("audit events must be enqueued inside the action's transaction")
	}
	if e.Actor == "" {
		e.Actor = auditSystemActorFallback
	}
	e.Service = auditService
	if _, err := audit.Enqueue(ctx, pool, e); err != nil {
		return fmt.Errorf("recording audit event %s: %w", e.Action, err)
	}
	return nil
}

// auditTransactionPosted is the evidence for a journal posting: who, what
// kind, against which entity, and every line with its GL code and amount at
// the currency's scale. Amounts are strings, as on every other wire this
// service writes — and here for a second reason: audit-trail hashes the
// state, and a float64 round-trip through JSONB would change the hash.
func auditTransactionPosted(ctx context.Context, tx *gorm.DB, txn *Transaction, accounts map[string]*Account, decimals map[string]int32) error {
	action := AuditTransactionPosted
	switch {
	case txn.Type == TxReversal:
		action = AuditTransactionReversed
	case txn.ManualEntry:
		action = AuditManualJournalPosted
	}

	lines := make([]map[string]any, 0, len(txn.Entries))
	for _, e := range txn.Entries {
		glCode := ""
		if a := accounts[e.AccountID]; a != nil {
			glCode = a.GLCode
		}
		lines = append(lines, map[string]any{
			"gl_code":   glCode,
			"direction": string(e.Direction),
			"currency":  e.Currency,
			"amount":    FormatDecimal(e.Amount, decimals[e.Currency]),
		})
	}

	after := map[string]any{
		"type":        string(txn.Type),
		"status":      string(txn.Status),
		"entity_type": string(txn.EntityType),
		"entity_id":   txn.EntityID,
		"value_date":  txn.ValueDate.Format("2006-01-02"),
		"entries":     lines,
	}
	meta := map[string]any{
		"idempotency_key": txn.IdempotencyKey,
		"description":     txn.Description,
	}
	if txn.ExternalRef != "" {
		meta["external_ref"] = txn.ExternalRef
	}
	if txn.ReversesTxID != nil {
		meta["reverses_tx_id"] = *txn.ReversesTxID
	}

	return enqueueAudit(ctx, tx, audit.Event{
		Actor:       txn.InitiatedBy,
		Action:      action,
		SubjectType: auditSubjectTransaction,
		SubjectID:   txn.ID,
		AfterState:  after,
		Metadata:    meta,
	})
}
