package ledger

import (
	"context"
	"math/big"
	"time"
)

// ---------------------------------------------------------------------------
// Operator flows
//
// TxFee and TxManualJournal have been declared, validated and chart-supported
// since the engine was written, and until now no route could reach them —
// every fee in the system was a side effect of some other flow, and there was
// no way at all to book a correction that wasn't a reversal. Treasury needs
// both in P3 (fee schedules, custodian adjustments), so the seams are opened
// here, with the guards that make hand-posting safe rather than a way around
// the invariants.
// ---------------------------------------------------------------------------

type ChargeFeeRequest struct {
	WalletID       string
	Amount         *big.Int
	FeeGLCode      string // which revenue account the fee lands in
	IdempotencyKey string
	Reason         string
	ValueDate      time.Time
	InitiatedBy    string
}

// ChargeFee books a standalone fee against a wallet.
//
//	DR  Customer wallet      (we owe them less)
//	CR  Fee revenue          (it is ours)
//
// It is not a manual journal: the wallet account is system-maintained and
// would reject a hand-posted entry, which is correct — a fee is a business
// event with its own transaction type, not an adjustment.
func (s *Service) ChargeFee(ctx context.Context, req ChargeFeeRequest) (*Transaction, error) {
	if err := requirePositive(req.Amount); err != nil {
		return nil, err
	}
	w, err := s.resolve(ctx, req.WalletID)
	if err != nil {
		return nil, err
	}
	feeAcct, err := s.systemAccount(ctx, req.FeeGLCode)
	if err != nil {
		return nil, err
	}
	if feeAcct.Type != REVENUE {
		return nil, postErr("NOT_A_REVENUE_ACCOUNT",
			"a fee is booked to revenue; %s is %s", feeAcct.GLCode, feeAcct.Type)
	}
	if feeAcct.Currency != w.currency.Code {
		return nil, postErr("CURRENCY_MISMATCH",
			"fee account %s is denominated in %s but the wallet holds %s",
			feeAcct.GLCode, feeAcct.Currency, w.currency.Code)
	}

	description := req.Reason
	if description == "" {
		description = "Fee"
	}

	return s.repo.Post(ctx, PostRequest{
		Type:                TxFee,
		IdempotencyKey:      req.IdempotencyKey,
		ValueDate:           req.ValueDate,
		Description:         description,
		EntityType:          EntityWallet,
		EntityID:            w.wallet.ID,
		InitiatedBy:         req.InitiatedBy,
		NonNegativeAccounts: []string{w.account.ID},
		Postings: []Posting{
			debit(w.account.ID, w.currency.Code, req.Amount, description),
			credit(feeAcct.ID, w.currency.Code, req.Amount, description),
		},
	})
}

// ManualLine is one line of an operator-entered journal, addressed by GL code
// rather than account id — an operator reads and types "5100.USD", not a uuid.
type ManualLine struct {
	GLCode      string
	Direction   Direction
	Amount      *big.Int
	Description string
}

type ManualJournalRequest struct {
	Lines          []ManualLine
	IdempotencyKey string
	Reason         string
	ValueDate      time.Time
	InitiatedBy    string
	EntityType     EntityType
	EntityID       string
}

// ManualJournal posts an operator-entered adjustment.
//
// ManualEntry: true is the whole safety story. It makes the posting engine
// enforce Account.ManualEntriesAllowed, which is false for every account that
// carries an invariant — USD-X in circulation, the bridge suspense account,
// every customer wallet. So an operator can reclassify an expense or book a
// custodian adjustment, and cannot hand-write a balance into existence or
// quietly patch up a wallet that a reversal should have corrected.
func (s *Service) ManualJournal(ctx context.Context, req ManualJournalRequest) (*Transaction, error) {
	if len(req.Lines) < 2 {
		return nil, postErr("TOO_FEW_POSTINGS",
			"a journal entry needs at least one debit and one credit, got %d line(s)", len(req.Lines))
	}
	if req.Reason == "" {
		return nil, postErr("MISSING_REASON", "a manual journal must say why it was posted")
	}

	postings := make([]Posting, 0, len(req.Lines))
	for _, l := range req.Lines {
		acct, err := s.systemAccount(ctx, l.GLCode)
		if err != nil {
			return nil, err
		}
		desc := l.Description
		if desc == "" {
			desc = req.Reason
		}
		postings = append(postings, Posting{
			AccountID:   acct.ID,
			Direction:   l.Direction,
			Currency:    acct.Currency,
			Amount:      l.Amount,
			Description: desc,
		})
	}

	return s.repo.Post(ctx, PostRequest{
		Type:           TxManualJournal,
		IdempotencyKey: req.IdempotencyKey,
		ValueDate:      req.ValueDate,
		Description:    req.Reason,
		EntityType:     req.EntityType,
		EntityID:       req.EntityID,
		ManualEntry:    true,
		InitiatedBy:    req.InitiatedBy,
		Metadata:       map[string]any{"reason": req.Reason},
		Postings:       postings,
	})
}
