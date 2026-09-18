package ledger

import (
	"context"
	"fmt"
	"math/big"
	"time"
)

// ---------------------------------------------------------------------------
// Balances are always derived, never stored in a mutable column.
//
// There are two ways to read one and they must agree:
//
//   - Balance()        O(1): the running_balance carried by the account's most
//                      recent journal line.
//   - DerivedBalance() O(n): the signed sum of every line the account has.
//
// Balance() is what the API serves. DerivedBalance() is the auditor, and
// VerifyRunningBalances() runs them against each other — a divergence means
// either a bug in the posting engine or a write that bypassed it, both of
// which you want to find out about from a job rather than from a customer.
// ---------------------------------------------------------------------------

// Balance returns the account's signed balance in its own normal side:
// positive means "more of what this account is for" — a customer wallet
// (LIABILITY) reads positive for money owed to the user, a custodian account
// (ASSET) reads positive for cash held.
func (r *Repository) Balance(ctx context.Context, accountID string) (*big.Int, error) {
	var row struct{ RunningBalance *string }
	err := r.db.WithContext(ctx).Raw(`
		SELECT running_balance
		FROM journal_entries
		WHERE account_id = ?
		ORDER BY seq DESC
		LIMIT 1`, accountID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	return parseNumeric(row.RunningBalance)
}

func (r *Repository) BalanceByGLCode(ctx context.Context, glCode string) (*big.Int, error) {
	a, err := r.AccountByGLCode(ctx, glCode)
	if err != nil {
		return nil, err
	}
	return r.Balance(ctx, a.ID)
}

// DerivedBalance recomputes the balance from the full history of entries.
func (r *Repository) DerivedBalance(ctx context.Context, accountID string) (*big.Int, error) {
	var row struct{ Total *string }
	err := r.db.WithContext(ctx).Raw(`
		SELECT COALESCE(SUM(
			CASE WHEN e.direction = a.normal_side THEN e.amount ELSE -e.amount END
		), 0)::text AS total
		FROM journal_entries e
		JOIN accounts a ON a.id = e.account_id
		WHERE e.account_id = ?`, accountID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	return parseNumeric(row.Total)
}

// BalanceDivergence is one account whose running balance disagrees with its
// own history.
type BalanceDivergence struct {
	AccountID string
	GLCode    string
	Running   *big.Int
	Derived   *big.Int
}

// VerifyRunningBalances checks every account's O(1) balance against the O(n)
// one. It returns the accounts that disagree; an empty slice is the healthy
// answer. Run it on a schedule and alert on any result.
func (r *Repository) VerifyRunningBalances(ctx context.Context) ([]BalanceDivergence, error) {
	var rows []struct {
		AccountID string
		GLCode    string
		Running   *string
		Derived   *string
	}
	err := r.db.WithContext(ctx).Raw(`
		SELECT a.id AS account_id,
		       a.gl_code,
		       COALESCE(latest.running_balance, 0)::text AS running,
		       COALESCE(sums.derived, 0)::text          AS derived
		FROM accounts a
		LEFT JOIN LATERAL (
			SELECT e.running_balance
			FROM journal_entries e
			WHERE e.account_id = a.id
			ORDER BY e.seq DESC
			LIMIT 1
		) latest ON true
		LEFT JOIN LATERAL (
			SELECT SUM(CASE WHEN e.direction = a.normal_side THEN e.amount ELSE -e.amount END) AS derived
			FROM journal_entries e
			WHERE e.account_id = a.id
		) sums ON true`).Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	var out []BalanceDivergence
	for _, row := range rows {
		running, err := parseNumeric(row.Running)
		if err != nil {
			return nil, err
		}
		derived, err := parseNumeric(row.Derived)
		if err != nil {
			return nil, err
		}
		if running.Cmp(derived) != 0 {
			out = append(out, BalanceDivergence{
				AccountID: row.AccountID, GLCode: row.GLCode, Running: running, Derived: derived,
			})
		}
	}
	return out, nil
}

// TrialBalanceLine is one account's totals within a trial balance.
type TrialBalanceLine struct {
	GLCode   string      `json:"gl_code"`
	Name     string      `json:"name"`
	Type     AccountType `json:"type"`
	Currency string      `json:"currency"`
	Debits   *big.Int    `json:"-"`
	Credits  *big.Int    `json:"-"`
	Balance  *big.Int    `json:"-"`
}

// TrialBalance is the whole-ledger integrity check: across every account in a
// currency, total debits must equal total credits. If Balanced is ever false
// the journal has been written to by something other than the posting engine.
type TrialBalance struct {
	Currency     string             `json:"currency"`
	AsOf         time.Time          `json:"as_of"`
	Lines        []TrialBalanceLine `json:"lines"`
	TotalDebits  *big.Int           `json:"-"`
	TotalCredits *big.Int           `json:"-"`
	Balanced     bool               `json:"balanced"`
}

func (r *Repository) TrialBalance(ctx context.Context, currency string, asOf time.Time) (*TrialBalance, error) {
	if asOf.IsZero() {
		asOf = time.Now().UTC()
	}
	var rows []struct {
		GLCode   string
		Name     string
		Type     AccountType
		Currency string
		Debits   *string
		Credits  *string
		Balance  *string
	}
	err := r.db.WithContext(ctx).Raw(`
		SELECT a.gl_code, a.name, a.type, a.currency,
		       COALESCE(SUM(CASE WHEN e.direction = 'DEBIT'  THEN e.amount ELSE 0 END), 0)::text AS debits,
		       COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE 0 END), 0)::text AS credits,
		       COALESCE(SUM(CASE WHEN e.direction = a.normal_side THEN e.amount ELSE -e.amount END), 0)::text AS balance
		FROM accounts a
		JOIN journal_entries e ON e.account_id = a.id AND e.value_date <= ?
		WHERE a.currency = ?
		GROUP BY a.gl_code, a.name, a.type, a.currency
		ORDER BY a.gl_code`, asOf, currency).Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	tb := &TrialBalance{
		Currency:     currency,
		AsOf:         asOf,
		TotalDebits:  big.NewInt(0),
		TotalCredits: big.NewInt(0),
	}
	for _, row := range rows {
		d, err := parseNumeric(row.Debits)
		if err != nil {
			return nil, err
		}
		c, err := parseNumeric(row.Credits)
		if err != nil {
			return nil, err
		}
		b, err := parseNumeric(row.Balance)
		if err != nil {
			return nil, err
		}
		tb.Lines = append(tb.Lines, TrialBalanceLine{
			GLCode: row.GLCode, Name: row.Name, Type: row.Type, Currency: row.Currency,
			Debits: d, Credits: c, Balance: b,
		})
		tb.TotalDebits.Add(tb.TotalDebits, d)
		tb.TotalCredits.Add(tb.TotalCredits, c)
	}
	tb.Balanced = tb.TotalDebits.Cmp(tb.TotalCredits) == 0
	return tb, nil
}

// Statement is an account's entries in journal order, for a customer-facing
// transaction list or an auditor's export.
func (r *Repository) Statement(ctx context.Context, accountID string, from, to time.Time, limit int) ([]JournalEntry, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	q := r.db.WithContext(ctx).Where("account_id = ?", accountID)
	if !from.IsZero() {
		q = q.Where("value_date >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("value_date <= ?", to)
	}
	var entries []JournalEntry
	err := q.Order("seq DESC").Limit(limit).Find(&entries).Error
	return entries, err
}

func parseNumeric(s *string) (*big.Int, error) {
	if s == nil || *s == "" {
		return big.NewInt(0), nil
	}
	v, ok := new(big.Int).SetString(*s, 10)
	if !ok {
		return nil, fmt.Errorf("ledger: database returned a non-integer amount %q", *s)
	}
	return v, nil
}
