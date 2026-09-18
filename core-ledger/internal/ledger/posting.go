package ledger

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// PostingError is a rejection the caller could have avoided — an unbalanced
// journal, a closed period, a frozen account. Code is stable and maps to an
// API error code; anything else coming out of Post is an infrastructure fault.
type PostingError struct {
	Code    string
	Message string
}

func (e *PostingError) Error() string { return e.Code + ": " + e.Message }

func postErr(code, format string, args ...any) *PostingError {
	return &PostingError{Code: code, Message: fmt.Sprintf(format, args...)}
}

// Posting is one requested line. Amount is always positive and in the
// currency's smallest unit; Direction carries the sign.
type Posting struct {
	AccountID   string
	Direction   Direction
	Currency    string
	Amount      *big.Int
	Description string
}

func debit(accountID, currency string, amount *big.Int, desc string) Posting {
	return Posting{AccountID: accountID, Direction: DirDebit, Currency: currency, Amount: amount, Description: desc}
}

func credit(accountID, currency string, amount *big.Int, desc string) Posting {
	return Posting{AccountID: accountID, Direction: DirCredit, Currency: currency, Amount: amount, Description: desc}
}

// PostRequest is one business event to be written to the journal atomically.
type PostRequest struct {
	Type           TxType
	IdempotencyKey string
	ValueDate      time.Time
	Description    string
	EntityType     EntityType
	EntityID       string
	ExternalRef    string
	FxQuoteID      *string
	ManualEntry    bool
	InitiatedBy    string
	Metadata       map[string]any
	Postings       []Posting

	// ReversesTxID is set only by Reverse.
	ReversesTxID *string

	// NonNegativeAccounts are accounts whose balance must not go below zero as
	// a result of this transaction — in practice, the wallet being debited.
	// The check belongs here rather than in the calling flow because only
	// inside the SERIALIZABLE transaction, after the rows are locked, is the
	// balance it reads still true by the time the entries are written. A
	// read-then-post in the caller is a race that overdraws under load.
	NonNegativeAccounts []string

	// AllowFrozen lets a posting land on a FROZEN account. Freezing blocks new
	// customer activity, but a reversal of an earlier mistake and a
	// court-ordered debit both have to reach a frozen wallet, so those paths
	// set this explicitly rather than the engine guessing.
	AllowFrozen bool
}

// ValidatePostings is the whole balance rule, as a pure function over the
// request and the accounts it names, so every rejection path is unit-testable
// without a database.
//
// Multi-currency transactions balance per currency, not in aggregate: an FX
// conversion's KES leg and USD leg are different units and can never sum to
// zero together. Each currency's debits and credits must match on their own,
// with the difference in economic value absorbed by an FX position account.
func ValidatePostings(req *PostRequest, accounts map[string]*Account) error {
	if !req.Type.Valid() {
		return postErr("INVALID_TX_TYPE", "unknown transaction type %q", req.Type)
	}
	if len(req.Postings) < 2 {
		return postErr("TOO_FEW_POSTINGS", "a journal entry needs at least one debit and one credit, got %d line(s)", len(req.Postings))
	}

	type sums struct {
		debits, credits   *big.Int
		nDebits, nCredits int
	}
	perCcy := map[string]*sums{}

	for i, p := range req.Postings {
		if p.Direction != DirDebit && p.Direction != DirCredit {
			return postErr("INVALID_DIRECTION", "line %d: direction must be DEBIT or CREDIT, got %q", i+1, p.Direction)
		}
		if p.Amount == nil {
			return postErr("MISSING_AMOUNT", "line %d: amount is required", i+1)
		}
		if p.Amount.Sign() <= 0 {
			// A negative debit is an unsigned credit wearing a disguise; it
			// would make "sum of debits equals sum of credits" pass on a
			// journal that is economically nonsense.
			return postErr("NON_POSITIVE_AMOUNT", "line %d: amount must be positive (use the opposite direction instead of a negative amount)", i+1)
		}

		acct, ok := accounts[p.AccountID]
		if !ok {
			return postErr("UNKNOWN_ACCOUNT", "line %d: account %s does not exist", i+1, p.AccountID)
		}
		if err := acct.Postable(); err != nil {
			return err
		}
		if acct.Status == AccountFrozen && !req.AllowFrozen {
			return postErr("ACCOUNT_FROZEN", "line %d: account %s is frozen", i+1, acct.GLCode)
		}
		if acct.Currency != p.Currency {
			return postErr("CURRENCY_MISMATCH", "line %d: account %s is denominated in %s, posting is in %s", i+1, acct.GLCode, acct.Currency, p.Currency)
		}
		if req.ManualEntry && !acct.ManualEntriesAllowed {
			return postErr("MANUAL_ENTRY_FORBIDDEN", "line %d: account %s is system-maintained; correct it by reversing the originating transaction instead of hand-posting", i+1, acct.GLCode)
		}

		s := perCcy[p.Currency]
		if s == nil {
			s = &sums{debits: big.NewInt(0), credits: big.NewInt(0)}
			perCcy[p.Currency] = s
		}
		if p.Direction == DirDebit {
			s.debits.Add(s.debits, p.Amount)
			s.nDebits++
		} else {
			s.credits.Add(s.credits, p.Amount)
			s.nCredits++
		}
	}

	for _, ccy := range sortedKeys(perCcy) {
		s := perCcy[ccy]
		if s.nDebits == 0 || s.nCredits == 0 {
			return postErr("UNBALANCED", "%s leg has %d debit(s) and %d credit(s); every currency needs both sides", ccy, s.nDebits, s.nCredits)
		}
		if s.debits.Cmp(s.credits) != 0 {
			return postErr("UNBALANCED", "%s leg does not balance: debits %s, credits %s", ccy, s.debits, s.credits)
		}
	}
	return nil
}

func sortedKeys[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// serializationRetries bounds how many times Post replays a transaction that
// the database aborted for serialization conflict. Under SERIALIZABLE (which
// CockroachDB gives us by default) a contended account is a normal, expected
// retry — not an error to surface.
const serializationRetries = 5

// Post writes one business event to the journal atomically. Everything that
// makes the ledger trustworthy happens in here and nowhere else: validation,
// the closed-period check, running-balance computation, and the single
// SERIALIZABLE database transaction that covers all of it.
func (r *Repository) Post(ctx context.Context, req PostRequest) (*Transaction, error) {
	if req.IdempotencyKey == "" {
		return nil, postErr("MISSING_IDEMPOTENCY_KEY", "every transaction needs a client-supplied idempotency key")
	}
	if req.ValueDate.IsZero() {
		req.ValueDate = time.Now().UTC()
	}
	req.ValueDate = req.ValueDate.UTC().Truncate(24 * time.Hour)

	// Fast path: a retry of a request we already posted returns the original
	// rather than a second set of entries.
	if existing, err := r.FindTransactionByIdempotencyKey(ctx, req.IdempotencyKey); err == nil {
		return existing, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	var out *Transaction
	var lastErr error
	for attempt := 0; attempt < serializationRetries; attempt++ {
		out, lastErr = r.postOnce(ctx, req)
		if lastErr == nil {
			return out, nil
		}
		if isUniqueViolation(lastErr) {
			// Another request with the same idempotency key won the race; its
			// transaction is the answer for both callers.
			return r.FindTransactionByIdempotencyKey(ctx, req.IdempotencyKey)
		}
		if !isSerializationFailure(lastErr) {
			return nil, lastErr
		}
	}
	return nil, fmt.Errorf("posting %s: still conflicting after %d serializable retries: %w", req.Type, serializationRetries, lastErr)
}

func (r *Repository) postOnce(ctx context.Context, req PostRequest) (*Transaction, error) {
	var posted *Transaction

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		accountIDs := make([]string, 0, len(req.Postings))
		seen := map[string]bool{}
		for _, p := range req.Postings {
			if !seen[p.AccountID] {
				seen[p.AccountID] = true
				accountIDs = append(accountIDs, p.AccountID)
			}
		}
		// Locking in a deterministic order is what keeps two concurrent
		// transfers touching the same pair of wallets from deadlocking on each
		// other; sorted account id is as good an order as any, as long as
		// every writer uses it.
		sort.Strings(accountIDs)

		var accts []Account
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id IN ?", accountIDs).Order("id").Find(&accts).Error; err != nil {
			return err
		}
		byID := make(map[string]*Account, len(accts))
		for i := range accts {
			byID[accts[i].ID] = &accts[i]
		}

		if err := ValidatePostings(&req, byID); err != nil {
			return err
		}
		if err := checkClosures(tx, req.ValueDate, req.Postings); err != nil {
			return err
		}

		balances, err := latestBalances(tx, accountIDs)
		if err != nil {
			return err
		}

		txn := &Transaction{
			ID:             uuid.New().String(),
			Type:           req.Type,
			Status:         TxPosted,
			IdempotencyKey: req.IdempotencyKey,
			ReversesTxID:   req.ReversesTxID,
			ManualEntry:    req.ManualEntry,
			EntityType:     req.EntityType,
			EntityID:       req.EntityID,
			ExternalRef:    req.ExternalRef,
			FxQuoteID:      req.FxQuoteID,
			ValueDate:      req.ValueDate,
			Description:    req.Description,
			InitiatedBy:    req.InitiatedBy,
			Metadata:       req.Metadata,
		}
		if err := tx.Omit("Entries").Create(txn).Error; err != nil {
			return err
		}

		entries := make([]JournalEntry, 0, len(req.Postings))
		for i, p := range req.Postings {
			acct := byID[p.AccountID]

			running, ok := balances[p.AccountID]
			if !ok {
				running = big.NewInt(0)
			}
			delta := new(big.Int).Set(p.Amount)
			if p.Direction.signVs(acct.NormalSide) < 0 {
				delta.Neg(delta)
			}
			running = new(big.Int).Add(running, delta)
			balances[p.AccountID] = running

			entries = append(entries, JournalEntry{
				ID:             uuid.New().String(),
				TransactionID:  txn.ID,
				LineNo:         int32(i + 1),
				AccountID:      p.AccountID,
				Direction:      p.Direction,
				Currency:       p.Currency,
				Amount:         new(big.Int).Set(p.Amount),
				RunningBalance: new(big.Int).Set(running),
				ValueDate:      req.ValueDate,
				Description:    p.Description,
			})
		}
		for _, id := range req.NonNegativeAccounts {
			bal, ok := balances[id]
			if !ok || bal.Sign() < 0 {
				acct := byID[id]
				glCode := id
				if acct != nil {
					glCode = acct.GLCode
				}
				shortfall := "unknown"
				if ok {
					shortfall = new(big.Int).Neg(bal).String()
				}
				return postErr("INSUFFICIENT_FUNDS",
					"account %s would be overdrawn by %s", glCode, shortfall)
			}
		}

		if err := tx.Create(&entries).Error; err != nil {
			return err
		}

		txn.Entries = entries
		posted = txn
		return nil
	}, &sql.TxOptions{Isolation: sql.LevelSerializable})

	return posted, err
}

// latestBalances reads each account's running balance as of its most recent
// journal line. DISTINCT ON keeps it to one index scan per account rather than
// summing the account's whole history on every post.
func latestBalances(tx *gorm.DB, accountIDs []string) (map[string]*big.Int, error) {
	out := make(map[string]*big.Int, len(accountIDs))
	if len(accountIDs) == 0 {
		return out, nil
	}

	var rows []JournalEntry
	err := tx.Raw(`
		SELECT DISTINCT ON (account_id) account_id, running_balance
		FROM journal_entries
		WHERE account_id IN ?
		ORDER BY account_id, seq DESC`, accountIDs).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		bal := row.RunningBalance
		if bal == nil {
			bal = big.NewInt(0)
		}
		out[row.AccountID] = bal
	}
	return out, nil
}

// checkClosures enforces Fineract's acc_gl_closure rule: once a period is
// closed, nothing may be posted into it, so a published reserve attestation
// can't be invalidated by a late back-dated entry. A closure row with an empty
// currency closes every currency at once.
func checkClosures(tx *gorm.DB, valueDate time.Time, postings []Posting) error {
	ccys := map[string]bool{}
	for _, p := range postings {
		ccys[p.Currency] = true
	}
	list := sortedKeys(ccys)

	var closures []LedgerClosure
	err := tx.Where("currency = '' OR currency IN ?", list).
		Where("closing_date >= ?", valueDate).
		Order("closing_date DESC").Limit(1).Find(&closures).Error
	if err != nil {
		return err
	}
	if len(closures) > 0 {
		c := closures[0]
		scope := c.Currency
		if scope == "" {
			scope = "all currencies"
		}
		return postErr("PERIOD_CLOSED",
			"value date %s falls on or before the %s accounting closure of %s",
			valueDate.Format("2006-01-02"), scope, c.ClosingDate.Format("2006-01-02"))
	}
	return nil
}

// Reverse cancels a transaction the Fineract way: it posts a second
// transaction whose lines are the original's with the directions flipped, then
// flags the original as reversed and cross-links the two. No amount, direction
// or account on the original is ever rewritten — the wrong entry stays in the
// journal forever, with its correction beside it.
func (r *Repository) Reverse(ctx context.Context, txID, reason, initiatedBy, idempotencyKey string) (*Transaction, error) {
	original, err := r.FindTransaction(ctx, txID)
	if err != nil {
		return nil, err
	}
	if original.Type == TxReversal {
		return nil, postErr("CANNOT_REVERSE_REVERSAL", "transaction %s is itself a reversal", txID)
	}
	if original.Reversed {
		if original.ReversalTxID != nil {
			return r.FindTransaction(ctx, *original.ReversalTxID)
		}
		return nil, postErr("ALREADY_REVERSED", "transaction %s is already reversed", txID)
	}
	if len(original.Entries) == 0 {
		return nil, postErr("NO_ENTRIES", "transaction %s has no journal lines to reverse", txID)
	}

	postings := make([]Posting, 0, len(original.Entries))
	for _, e := range original.Entries {
		postings = append(postings, Posting{
			AccountID:   e.AccountID,
			Direction:   e.Direction.Opposite(),
			Currency:    e.Currency,
			Amount:      new(big.Int).Set(e.Amount),
			Description: "reversal of " + e.Description,
		})
	}
	if idempotencyKey == "" {
		idempotencyKey = "reversal:" + txID
	}
	if reason == "" {
		reason = "reversal of " + string(original.Type) + " " + txID
	}

	reversal, err := r.Post(ctx, PostRequest{
		Type:           TxReversal,
		IdempotencyKey: idempotencyKey,
		// The reversal books on the original's value date so a closed period
		// stays internally consistent and a corrected month doesn't leak into
		// the next one. If that period is closed, the closure check rejects it
		// — which is the intended conversation, not a bug.
		ValueDate:    original.ValueDate,
		Description:  reason,
		EntityType:   original.EntityType,
		EntityID:     original.EntityID,
		ExternalRef:  original.ExternalRef,
		FxQuoteID:    original.FxQuoteID,
		InitiatedBy:  initiatedBy,
		ReversesTxID: &original.ID,
		AllowFrozen:  true,
		Metadata:     map[string]any{"reverses": original.ID, "reason": reason},
		Postings:     postings,
	})
	if err != nil {
		return nil, err
	}

	// The only UPDATE this package issues against a posted transaction, and
	// it touches bookkeeping flags rather than money.
	err = r.db.WithContext(ctx).Model(&Transaction{}).
		Where("id = ? AND reversed = false", original.ID).
		Updates(map[string]any{"reversed": true, "status": TxReversed, "reversal_tx_id": reversal.ID}).Error
	if err != nil {
		return nil, err
	}
	return reversal, nil
}

func isSerializationFailure(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		// 40001 serialization_failure, 40P01 deadlock_detected
		return pgErr.Code == "40001" || pgErr.Code == "40P01"
	}
	return false
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}
