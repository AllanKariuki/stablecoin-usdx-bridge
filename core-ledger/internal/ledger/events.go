package ledger

import (
	"encoding/json"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/outbox"

	"gorm.io/gorm"
)

// EventTransactionPosted is the one event core-ledger emits today. The
// damp.<domain>.<event>.v1 shape is the NATS subject P3 will publish it on;
// naming it that way now means the migration from HTTP relay to JetStream
// changes the transport and nothing else.
const EventTransactionPosted = "damp.ledger.transaction_posted.v1"

const aggregateTransaction = "TRANSACTION"

// transactionPostedPayload is a public contract the moment it leaves the
// process, so it is written out explicitly rather than marshalled from the
// GORM models — a column rename must not silently become a breaking change
// for every consumer.
//
// Amounts carry their scale with them, in the same shape the BFF emits to the
// browser: a bare "25000" is meaningless without knowing USD has 2 decimals
// and USD-X has 6, and a consumer that guesses wrong is off by 10,000x.
type transactionPostedPayload struct {
	TransactionID  string         `json:"transaction_id"`
	Type           TxType         `json:"type"`
	Status         TxStatus       `json:"status"`
	IdempotencyKey string         `json:"idempotency_key"`
	EntityType     EntityType     `json:"entity_type"`
	EntityID       string         `json:"entity_id"`
	ExternalRef    string         `json:"external_ref"`
	ReversesTxID   *string        `json:"reverses_tx_id"`
	ManualEntry    bool           `json:"manual_entry"`
	ValueDate      string         `json:"value_date"`
	Description    string         `json:"description"`
	InitiatedBy    string         `json:"initiated_by"`
	Metadata       map[string]any `json:"metadata,omitempty"`
	PostedAt       string         `json:"posted_at"`
	Entries        []entryPayload `json:"entries"`
}

type entryPayload struct {
	LineNo         int32     `json:"line_no"`
	AccountID      string    `json:"account_id"`
	GLCode         string    `json:"gl_code"`
	Direction      Direction `json:"direction"`
	Currency       string    `json:"currency"`
	Decimals       int32     `json:"decimals"`
	Amount         string    `json:"amount"`
	RunningBalance string    `json:"running_balance"`
}

// enqueueTransactionPosted writes the outbox row for a freshly posted
// transaction, using the same *gorm.DB handle — and therefore the same
// SERIALIZABLE transaction — that wrote the journal lines.
func enqueueTransactionPosted(tx *gorm.DB, txn *Transaction, accounts map[string]*Account) error {
	decimals, err := currencyDecimals(tx, txn.Entries)
	if err != nil {
		return err
	}

	entries := make([]entryPayload, 0, len(txn.Entries))
	for _, e := range txn.Entries {
		d := decimals[e.Currency]
		glCode := ""
		if a := accounts[e.AccountID]; a != nil {
			glCode = a.GLCode
		}
		entries = append(entries, entryPayload{
			LineNo:         e.LineNo,
			AccountID:      e.AccountID,
			GLCode:         glCode,
			Direction:      e.Direction,
			Currency:       e.Currency,
			Decimals:       d,
			Amount:         FormatDecimal(e.Amount, d),
			RunningBalance: FormatDecimal(e.RunningBalance, d),
		})
	}

	payload, err := json.Marshal(transactionPostedPayload{
		TransactionID:  txn.ID,
		Type:           txn.Type,
		Status:         txn.Status,
		IdempotencyKey: txn.IdempotencyKey,
		EntityType:     txn.EntityType,
		EntityID:       txn.EntityID,
		ExternalRef:    txn.ExternalRef,
		ReversesTxID:   txn.ReversesTxID,
		ManualEntry:    txn.ManualEntry,
		ValueDate:      txn.ValueDate.Format("2006-01-02"),
		Description:    txn.Description,
		InitiatedBy:    txn.InitiatedBy,
		Metadata:       txn.Metadata,
		PostedAt:       time.Now().UTC().Format(time.RFC3339Nano),
		Entries:        entries,
	})
	if err != nil {
		return err
	}

	return outbox.Enqueue(tx, &outbox.Event{
		EventType:     EventTransactionPosted,
		AggregateType: aggregateTransaction,
		AggregateID:   txn.ID,
		Payload:       string(payload),
	})
}

func currencyDecimals(tx *gorm.DB, entries []JournalEntry) (map[string]int32, error) {
	codes := map[string]bool{}
	for _, e := range entries {
		codes[e.Currency] = true
	}
	list := sortedKeys(codes)

	var currencies []Currency
	if err := tx.Where("code IN ?", list).Find(&currencies).Error; err != nil {
		return nil, err
	}
	out := make(map[string]int32, len(currencies))
	for _, c := range currencies {
		out[c.Code] = c.Decimals
	}
	return out, nil
}
