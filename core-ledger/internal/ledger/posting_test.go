package ledger

import (
	"math/big"
	"strings"
	"testing"
)

// acct builds a postable DETAIL account for tests.
func acct(id string, typ AccountType, currency string) *Account {
	return &Account{
		ID:         id,
		GLCode:     id,
		Type:       typ,
		Currency:   currency,
		NormalSide: typ.NormalSide(),
		Usage:      UsageDetail,
		Status:     AccountActive,
	}
}

func chart(accounts ...*Account) map[string]*Account {
	m := map[string]*Account{}
	for _, a := range accounts {
		m[a.ID] = a
	}
	return m
}

func n(v int64) *big.Int { return big.NewInt(v) }

func wantCode(t *testing.T, err error, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error %s, got nil", code)
	}
	pe, ok := err.(*PostingError)
	if !ok {
		t.Fatalf("expected a *PostingError, got %T: %v", err, err)
	}
	if pe.Code != code {
		t.Fatalf("expected code %s, got %s (%s)", code, pe.Code, pe.Message)
	}
}

func TestValidatePostingsAcceptsABalancedJournal(t *testing.T) {
	bank := acct("bank", ASSET, "USD")
	wallet := acct("wallet", LIABILITY, "USD")

	req := &PostRequest{
		Type: TxFiatDeposit,
		Postings: []Posting{
			debit(bank.ID, "USD", n(100_00), ""),
			credit(wallet.ID, "USD", n(100_00), ""),
		},
	}
	if err := ValidatePostings(req, chart(bank, wallet)); err != nil {
		t.Fatalf("expected a balanced deposit to validate, got %v", err)
	}
}

func TestValidatePostingsRejectsAnUnbalancedJournal(t *testing.T) {
	bank := acct("bank", ASSET, "USD")
	wallet := acct("wallet", LIABILITY, "USD")

	req := &PostRequest{
		Type: TxFiatDeposit,
		Postings: []Posting{
			debit(bank.ID, "USD", n(100_00), ""),
			credit(wallet.ID, "USD", n(99_00), ""),
		},
	}
	wantCode(t, ValidatePostings(req, chart(bank, wallet)), "UNBALANCED")
}

// The rule that makes FX possible: each currency balances on its own, and a
// transaction whose currencies each balance is valid even though no single
// total across the whole journal is zero.
func TestValidatePostingsBalancesEachCurrencySeparately(t *testing.T) {
	kesWallet := acct("kes-wallet", LIABILITY, "KES")
	kesPos := acct("kes-pos", ASSET, "KES")
	usdPos := acct("usd-pos", ASSET, "USD")
	usdWallet := acct("usd-wallet", LIABILITY, "USD")
	spread := acct("spread", REVENUE, "USD")
	accounts := chart(kesWallet, kesPos, usdPos, usdWallet, spread)

	good := &PostRequest{
		Type: TxFXConversion,
		Postings: []Posting{
			debit(kesWallet.ID, "KES", n(130_000_00), ""),
			credit(kesPos.ID, "KES", n(130_000_00), ""),
			debit(usdPos.ID, "USD", n(1_000_00), ""),
			credit(usdWallet.ID, "USD", n(995_00), ""),
			credit(spread.ID, "USD", n(5_00), ""),
		},
	}
	if err := ValidatePostings(good, accounts); err != nil {
		t.Fatalf("expected a two-currency conversion to validate, got %v", err)
	}

	// The USD leg alone is short; the KES leg being fine must not rescue it.
	bad := &PostRequest{
		Type: TxFXConversion,
		Postings: []Posting{
			debit(kesWallet.ID, "KES", n(130_000_00), ""),
			credit(kesPos.ID, "KES", n(130_000_00), ""),
			debit(usdPos.ID, "USD", n(1_000_00), ""),
			credit(usdWallet.ID, "USD", n(995_00), ""),
		},
	}
	err := ValidatePostings(bad, accounts)
	wantCode(t, err, "UNBALANCED")
	if !strings.Contains(err.Error(), "USD") {
		t.Errorf("the error should name the currency that failed, got %q", err.Error())
	}
}

// A currency with only debits sums to the same thing as one with none, so the
// totals check alone would let it through.
func TestValidatePostingsRejectsAOneSidedCurrency(t *testing.T) {
	usdWallet := acct("usd-wallet", LIABILITY, "USD")
	usdBank := acct("usd-bank", ASSET, "USD")
	usdxWallet := acct("usdx-wallet", LIABILITY, "USDX")

	req := &PostRequest{
		Type: TxUSDXIssue,
		Postings: []Posting{
			debit(usdWallet.ID, "USD", n(100_00), ""),
			credit(usdBank.ID, "USD", n(100_00), ""),
			credit(usdxWallet.ID, "USDX", n(100_000000), ""),
		},
	}
	wantCode(t, ValidatePostings(req, chart(usdWallet, usdBank, usdxWallet)), "UNBALANCED")
}

func TestValidatePostingsRejectsNonPositiveAmounts(t *testing.T) {
	bank := acct("bank", ASSET, "USD")
	wallet := acct("wallet", LIABILITY, "USD")
	accounts := chart(bank, wallet)

	// A negative debit would pass a naive debits-equal-credits check while
	// meaning the opposite of what it says.
	req := &PostRequest{
		Type: TxFiatDeposit,
		Postings: []Posting{
			debit(bank.ID, "USD", n(-100_00), ""),
			credit(wallet.ID, "USD", n(-100_00), ""),
		},
	}
	wantCode(t, ValidatePostings(req, accounts), "NON_POSITIVE_AMOUNT")

	zero := &PostRequest{
		Type: TxFiatDeposit,
		Postings: []Posting{
			debit(bank.ID, "USD", n(0), ""),
			credit(wallet.ID, "USD", n(0), ""),
		},
	}
	wantCode(t, ValidatePostings(zero, accounts), "NON_POSITIVE_AMOUNT")
}

func TestValidatePostingsRejectsHeaderAccounts(t *testing.T) {
	header := acct("rollup", LIABILITY, "USD")
	header.Usage = UsageHeader
	bank := acct("bank", ASSET, "USD")

	req := &PostRequest{
		Type: TxFiatDeposit,
		Postings: []Posting{
			debit(bank.ID, "USD", n(100_00), ""),
			credit(header.ID, "USD", n(100_00), ""),
		},
	}
	wantCode(t, ValidatePostings(req, chart(bank, header)), "ACCOUNT_NOT_DETAIL")
}

func TestValidatePostingsRejectsCurrencyMismatch(t *testing.T) {
	bank := acct("bank", ASSET, "USD")
	wallet := acct("wallet", LIABILITY, "KES")

	req := &PostRequest{
		Type: TxFiatDeposit,
		Postings: []Posting{
			debit(bank.ID, "USD", n(100_00), ""),
			credit(wallet.ID, "USD", n(100_00), ""), // wallet holds KES
		},
	}
	wantCode(t, ValidatePostings(req, chart(bank, wallet)), "CURRENCY_MISMATCH")
}

func TestValidatePostingsHonoursAccountStatus(t *testing.T) {
	bank := acct("bank", ASSET, "USD")
	wallet := acct("wallet", LIABILITY, "USD")
	wallet.Status = AccountFrozen
	accounts := chart(bank, wallet)

	req := PostRequest{
		Type: TxFiatDeposit,
		Postings: []Posting{
			debit(bank.ID, "USD", n(100_00), ""),
			credit(wallet.ID, "USD", n(100_00), ""),
		},
	}
	wantCode(t, ValidatePostings(&req, accounts), "ACCOUNT_FROZEN")

	// A reversal has to be able to reach a frozen wallet, or a compliance hold
	// would permanently strand whatever was wrongly posted into it.
	req.AllowFrozen = true
	if err := ValidatePostings(&req, accounts); err != nil {
		t.Fatalf("AllowFrozen should let the posting through, got %v", err)
	}

	// A closed account is closed to everyone, reversals included.
	wallet.Status = AccountClosed
	wantCode(t, ValidatePostings(&req, accounts), "ACCOUNT_CLOSED")
}

func TestValidatePostingsBarsManualEntriesIntoSystemAccounts(t *testing.T) {
	bank := acct("bank", ASSET, "USD")
	bank.ManualEntriesAllowed = true
	wallet := acct("wallet", LIABILITY, "USD") // customer money: never hand-posted

	req := &PostRequest{
		Type:        TxManualJournal,
		ManualEntry: true,
		Postings: []Posting{
			debit(bank.ID, "USD", n(100_00), ""),
			credit(wallet.ID, "USD", n(100_00), ""),
		},
	}
	wantCode(t, ValidatePostings(req, chart(bank, wallet)), "MANUAL_ENTRY_FORBIDDEN")
}

func TestValidatePostingsRejectsASingleLine(t *testing.T) {
	bank := acct("bank", ASSET, "USD")
	req := &PostRequest{
		Type:     TxFiatDeposit,
		Postings: []Posting{debit(bank.ID, "USD", n(100_00), "")},
	}
	wantCode(t, ValidatePostings(req, chart(bank)), "TOO_FEW_POSTINGS")
}

// The running balance reads in the account's own normal side, which is what
// makes a wallet balance a positive "we owe you" rather than a negative number
// the API has to remember to flip.
func TestDirectionSignIsRelativeToNormalSide(t *testing.T) {
	cases := []struct {
		typ  AccountType
		dir  Direction
		want int
	}{
		{ASSET, DirDebit, 1},      // cash in the bank goes up on a debit
		{ASSET, DirCredit, -1},    // and down on a credit
		{LIABILITY, DirCredit, 1}, // crediting a wallet means we owe more
		{LIABILITY, DirDebit, -1},
		{REVENUE, DirCredit, 1},
		{EXPENSE, DirDebit, 1},
	}
	for _, c := range cases {
		if got := c.dir.signVs(c.typ.NormalSide()); got != c.want {
			t.Errorf("%s on a %s account: sign %d, want %d", c.dir, c.typ, got, c.want)
		}
	}
}
