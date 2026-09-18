package ledger

import (
	"context"
	"math/big"
	"os"
	"testing"
	"time"
)

// These tests run against a real PostgreSQL instance, because the parts of
// this package worth doubting most are the parts a fake would paper over: the
// migrations, the SERIALIZABLE posting transaction, the running-balance read,
// the unique index behind idempotency, and the append-only trigger.
//
//	docker compose up -d postgres
//	LEDGER_TEST_DATABASE_URL='postgres://bridge:bridge@localhost:5432/ledger_it?sslmode=disable' go test ./internal/ledger/ -run Integration -v
func testRepo(t *testing.T) (*Repository, *Service, context.Context) {
	t.Helper()
	dsn := os.Getenv("LEDGER_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set LEDGER_TEST_DATABASE_URL to run ledger integration tests")
	}

	repo, err := NewRepository(dsn)
	if err != nil {
		t.Fatalf("connecting: %v", err)
	}
	ctx := context.Background()
	if err := repo.Bootstrap(ctx, DefaultCurrencies()); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	return repo, NewService(repo, FeeSchedule{IssuanceBps: 10, RedemptionBps: 10, TransferBps: 0, WithdrawalBps: 0}), ctx
}

// uniqueUser keeps runs independent without truncating the journal — which the
// append-only trigger would refuse anyway.
func uniqueUser(t *testing.T) string {
	t.Helper()
	return "user-" + t.Name() + "-" + time.Now().UTC().Format("20060102150405.000000000")
}

func key(t *testing.T, suffix string) string {
	t.Helper()
	return t.Name() + ":" + suffix + ":" + time.Now().UTC().Format("150405.000000000")
}

func balanceOf(t *testing.T, repo *Repository, ctx context.Context, accountID, want string) {
	t.Helper()
	bal, err := repo.Balance(ctx, accountID)
	if err != nil {
		t.Fatalf("reading balance: %v", err)
	}
	if bal.String() != want {
		t.Fatalf("balance = %s, want %s", bal, want)
	}
}

func TestIntegrationDepositAndWithdraw(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	w, err := repo.EnsureWallet(ctx, user, "USD", "", "", "Main")
	if err != nil {
		t.Fatalf("EnsureWallet: %v", err)
	}

	if _, err := svc.Deposit(ctx, DepositRequest{
		WalletID: w.ID, Amount: n(1_000_00), IdempotencyKey: key(t, "dep"), BankRef: "BANK-1",
	}); err != nil {
		t.Fatalf("Deposit: %v", err)
	}
	balanceOf(t, repo, ctx, w.AccountID, "100000")

	if _, err := svc.Withdraw(ctx, WithdrawRequest{
		WalletID: w.ID, Amount: n(250_00), IdempotencyKey: key(t, "wd"), BankRef: "BANK-2",
	}); err != nil {
		t.Fatalf("Withdraw: %v", err)
	}
	balanceOf(t, repo, ctx, w.AccountID, "75000")

	// Overdraft protection lives inside the posting transaction, so it holds
	// even though the caller never read the balance first.
	_, err = svc.Withdraw(ctx, WithdrawRequest{
		WalletID: w.ID, Amount: n(1_000_00), IdempotencyKey: key(t, "wd2"), BankRef: "BANK-3",
	})
	wantCode(t, err, "INSUFFICIENT_FUNDS")
	balanceOf(t, repo, ctx, w.AccountID, "75000")
}

// A retried request must return the original transaction, not post a second
// one. This is the guarantee the whole mint/burn path leans on.
func TestIntegrationIdempotency(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	w, err := repo.EnsureWallet(ctx, user, "USD", "", "", "Main")
	if err != nil {
		t.Fatal(err)
	}
	k := key(t, "dep")

	first, err := svc.Deposit(ctx, DepositRequest{WalletID: w.ID, Amount: n(500_00), IdempotencyKey: k})
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.Deposit(ctx, DepositRequest{WalletID: w.ID, Amount: n(500_00), IdempotencyKey: k})
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID {
		t.Fatalf("retry created a second transaction: %s then %s", first.ID, second.ID)
	}
	balanceOf(t, repo, ctx, w.AccountID, "50000")
}

// The full fiat -> USD-X -> chain path, checking that the money is accounted
// for at every intermediate state rather than only at the end.
func TestIntegrationIssuanceLifecycle(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	fiat, err := repo.EnsureWallet(ctx, user, "USD", "", "", "USD")
	if err != nil {
		t.Fatal(err)
	}
	usdxWallet, err := repo.EnsureWallet(ctx, user, USDXCode, "ETHEREUM", "0xabc", "USD-X on Ethereum")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Deposit(ctx, DepositRequest{WalletID: fiat.ID, Amount: n(1_000_00), IdempotencyKey: key(t, "dep")}); err != nil {
		t.Fatal(err)
	}

	circulationBefore, _ := repo.BalanceByGLCode(ctx, GLCirculation)
	suspenseBefore, _ := repo.BalanceByGLCode(ctx, GLBridgeSuspense)
	backingBefore, _ := repo.BalanceByGLCode(ctx, GLReserveBacking(PegCurrency))

	correlation := "corr-" + usdxWallet.ID
	issue, err := svc.Issue(ctx, IssueRequest{
		FiatWalletID:   fiat.ID,
		USDXWalletID:   usdxWallet.ID,
		Amount:         n(100_00), // 100.00 USD, 10bps fee
		IdempotencyKey: key(t, "issue"),
		CorrelationID:  correlation,
	})
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	// 100.00 USD in, 0.10 fee, 99.90 backing -> 99.900000 USD-X issued.
	if got := issue.Metadata["usdx_amount"]; got != "99900000" {
		t.Fatalf("issued USD-X = %v, want 99900000", got)
	}
	balanceOf(t, repo, ctx, fiat.AccountID, "90000") // 1000.00 - 100.00

	// The USD-X exists in the ledger but not yet in the user's wallet: until
	// the chain mint confirms it sits in suspense.
	balanceOf(t, repo, ctx, usdxWallet.AccountID, "0")
	assertDelta(t, repo, ctx, GLCirculation, circulationBefore, "99900000")
	assertDelta(t, repo, ctx, GLBridgeSuspense, suspenseBefore, "99900000")
	assertDelta(t, repo, ctx, GLReserveBacking(PegCurrency), backingBefore, "9990")

	// Chain mint confirms.
	if _, err := svc.ConfirmUSDXCredit(ctx, usdxWallet.ID, n(99_900000), correlation, "0xdeadbeef"); err != nil {
		t.Fatalf("ConfirmUSDXCredit: %v", err)
	}
	balanceOf(t, repo, ctx, usdxWallet.AccountID, "99900000")
	assertDelta(t, repo, ctx, GLBridgeSuspense, suspenseBefore, "0") // released

	assertLedgerHealthy(t, repo, ctx)
}

func TestIntegrationBridgeMovesValueThroughSuspense(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	eth, err := repo.EnsureWallet(ctx, user, USDXCode, "ETHEREUM", "0xabc", "")
	if err != nil {
		t.Fatal(err)
	}
	sol, err := repo.EnsureWallet(ctx, user, USDXCode, "SOLANA", "So1ana", "")
	if err != nil {
		t.Fatal(err)
	}
	seedUSDX(t, repo, ctx, user, eth, n(500_000000))

	suspenseBefore, _ := repo.BalanceByGLCode(ctx, GLBridgeSuspense)
	correlation := "bridge-" + eth.ID

	if _, err := svc.BridgeOut(ctx, eth.ID, n(200_000000), correlation, "0xburn"); err != nil {
		t.Fatalf("BridgeOut: %v", err)
	}
	balanceOf(t, repo, ctx, eth.AccountID, "300000000")
	// Mid-bridge, the value is on neither chain and the suspense balance says so.
	assertDelta(t, repo, ctx, GLBridgeSuspense, suspenseBefore, "200000000")

	if _, err := svc.BridgeIn(ctx, sol.ID, n(200_000000), correlation, "0xmint"); err != nil {
		t.Fatalf("BridgeIn: %v", err)
	}
	balanceOf(t, repo, ctx, sol.AccountID, "200000000")
	assertDelta(t, repo, ctx, GLBridgeSuspense, suspenseBefore, "0")

	// A bridge creates and destroys no supply.
	total := new(big.Int).Add(mustBalance(t, repo, ctx, eth.AccountID), mustBalance(t, repo, ctx, sol.AccountID))
	if total.String() != "500000000" {
		t.Fatalf("bridging changed total holdings: %s", total)
	}
	assertLedgerHealthy(t, repo, ctx)
}

func TestIntegrationFXConversion(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	kesWallet, err := repo.EnsureWallet(ctx, user, "KES", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	usdWallet, err := repo.EnsureWallet(ctx, user, "USD", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Deposit(ctx, DepositRequest{WalletID: kesWallet.ID, Amount: n(130_000_00), IdempotencyKey: key(t, "dep")}); err != nil {
		t.Fatal(err)
	}

	rate, _ := ParseRate("0.007692307692307692")
	q := &FxQuote{BaseCcy: "KES", QuoteCcy: "USD", Rate: rate, SpreadBps: 50, Source: "test", ExpiresAt: time.Now().Add(time.Hour)}
	if err := repo.SaveQuote(ctx, q); err != nil {
		t.Fatal(err)
	}

	tx, err := svc.Convert(ctx, ConvertRequest{
		FromWalletID: kesWallet.ID, ToWalletID: usdWallet.ID,
		Amount: n(130_000_00), QuoteID: q.ID, IdempotencyKey: key(t, "fx"),
	})
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	if tx.FxQuoteID == nil || *tx.FxQuoteID != q.ID {
		t.Error("the conversion should record which quote it used")
	}

	balanceOf(t, repo, ctx, kesWallet.AccountID, "0")
	balanceOf(t, repo, ctx, usdWallet.AccountID, "99500") // 995.00 after 50bps

	// Both currencies still balance on their own even though the transaction
	// spans two of them.
	assertLedgerHealthy(t, repo, ctx)
	for _, ccy := range []string{"KES", "USD"} {
		tb, err := repo.TrialBalance(ctx, ccy, time.Time{})
		if err != nil {
			t.Fatal(err)
		}
		if !tb.Balanced {
			t.Errorf("%s trial balance is out: debits %s credits %s", ccy, tb.TotalDebits, tb.TotalCredits)
		}
	}
}

func TestIntegrationRedemption(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	usdWallet, err := repo.EnsureWallet(ctx, user, "USD", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	usdxWallet, err := repo.EnsureWallet(ctx, user, USDXCode, "SOLANA", "So1", "")
	if err != nil {
		t.Fatal(err)
	}
	seedUSDX(t, repo, ctx, user, usdxWallet, n(100_000000))

	redeem, err := svc.Redeem(ctx, RedeemRequest{
		USDXWalletID: usdxWallet.ID, FiatWalletID: usdWallet.ID,
		Amount: n(50_000000), IdempotencyKey: key(t, "redeem"),
	})
	if err != nil {
		t.Fatalf("Redeem: %v", err)
	}
	// The USD-X is out of the wallet but the fiat has not been released — the
	// burn has not settled yet.
	balanceOf(t, repo, ctx, usdxWallet.AccountID, "50000000")
	usdBefore := mustBalance(t, repo, ctx, usdWallet.AccountID)

	if _, err := svc.ConfirmRedemption(ctx, redeem.ID, "0xburn", "", "test"); err != nil {
		t.Fatalf("ConfirmRedemption: %v", err)
	}
	usdAfter := mustBalance(t, repo, ctx, usdWallet.AccountID)
	// 50.000000 USD-X -> 50.00 USD less a 10bps fee = 49.95.
	if got := new(big.Int).Sub(usdAfter, usdBefore).String(); got != "4995" {
		t.Fatalf("redemption paid %s, want 4995", got)
	}
	assertLedgerHealthy(t, repo, ctx)
}

// A reversal cancels a transaction without rewriting it: both rows survive and
// the balance returns to where it was.
func TestIntegrationReversal(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	w, err := repo.EnsureWallet(ctx, user, "USD", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	dep, err := svc.Deposit(ctx, DepositRequest{WalletID: w.ID, Amount: n(300_00), IdempotencyKey: key(t, "dep")})
	if err != nil {
		t.Fatal(err)
	}
	balanceOf(t, repo, ctx, w.AccountID, "30000")

	rev, err := repo.Reverse(ctx, dep.ID, "posted in error", "ops", "")
	if err != nil {
		t.Fatalf("Reverse: %v", err)
	}
	balanceOf(t, repo, ctx, w.AccountID, "0")

	original, err := repo.FindTransaction(ctx, dep.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !original.Reversed || original.ReversalTxID == nil || *original.ReversalTxID != rev.ID {
		t.Error("the original should be flagged and cross-linked to its reversal")
	}
	if len(original.Entries) != 2 {
		t.Errorf("the original's entries should survive untouched, got %d", len(original.Entries))
	}
	if rev.ReversesTxID == nil || *rev.ReversesTxID != dep.ID {
		t.Error("the reversal should point back at what it reverses")
	}

	// Reversing twice is a no-op that returns the existing reversal.
	again, err := repo.Reverse(ctx, dep.ID, "again", "ops", "")
	if err != nil {
		t.Fatalf("second Reverse: %v", err)
	}
	if again.ID != rev.ID {
		t.Error("reversing an already-reversed transaction should return the original reversal")
	}
	assertLedgerHealthy(t, repo, ctx)
}

// History is not editable, and not only by convention: the database refuses.
func TestIntegrationJournalIsAppendOnly(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	w, err := repo.EnsureWallet(ctx, user, "USD", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	tx, err := svc.Deposit(ctx, DepositRequest{WalletID: w.ID, Amount: n(10_00), IdempotencyKey: key(t, "dep")})
	if err != nil {
		t.Fatal(err)
	}

	err = repo.db.WithContext(ctx).Exec(
		"UPDATE journal_entries SET amount = 1 WHERE transaction_id = ?", tx.ID).Error
	if err == nil {
		t.Fatal("expected the database to refuse an UPDATE on journal_entries")
	}

	err = repo.db.WithContext(ctx).Exec(
		"DELETE FROM journal_entries WHERE transaction_id = ?", tx.ID).Error
	if err == nil {
		t.Fatal("expected the database to refuse a DELETE on journal_entries")
	}
	balanceOf(t, repo, ctx, w.AccountID, "1000")
}

func TestIntegrationClosedPeriodRejectsBackdatedPostings(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	w, err := repo.EnsureWallet(ctx, user, "GBP", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	closingDate := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	if _, err := repo.ClosePeriod(ctx, "GBP", closingDate, "January close", "ops"); err != nil {
		t.Fatalf("ClosePeriod: %v", err)
	}

	_, err = svc.Deposit(ctx, DepositRequest{
		WalletID: w.ID, Amount: n(10_00), IdempotencyKey: key(t, "backdated"),
		ValueDate: time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
	})
	wantCode(t, err, "PERIOD_CLOSED")

	// A posting after the close is still fine.
	if _, err := svc.Deposit(ctx, DepositRequest{
		WalletID: w.ID, Amount: n(10_00), IdempotencyKey: key(t, "after"),
		ValueDate: time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC),
	}); err != nil {
		t.Fatalf("a posting after the closure should be accepted, got %v", err)
	}
}

// ---------------------------------------------------------------------------

// seedUSDX gets USD-X into a wallet the way the system really does — by
// depositing fiat and issuing against it — so a test's starting state is one
// the ledger could actually have reached, with the reserve backing and
// circulation accounts already consistent with the balance.
//
// Seeding posts through a fee-free service so the arithmetic stays exact: the
// fee behaviour has its own assertions in TestIntegrationIssuanceLifecycle and
// does not need re-proving in every fixture.
func seedUSDX(t *testing.T, repo *Repository, ctx context.Context, user string, usdxWallet *Wallet, amount *big.Int) {
	t.Helper()

	free := NewService(repo, FeeSchedule{})
	fiat, err := repo.EnsureWallet(ctx, user, PegCurrency, "", "", "")
	if err != nil {
		t.Fatal(err)
	}

	// USD-X has 6 decimals and USD has 2, so the peg's only effect is a 10^4
	// rescale. Seeding a non-round number of USD-X would not survive it.
	usd, remainder := new(big.Int).QuoRem(amount, big.NewInt(10_000), new(big.Int))
	if remainder.Sign() != 0 {
		t.Fatalf("seed amount %s is not a whole number of USD cents once rescaled", amount)
	}

	if _, err := free.Deposit(ctx, DepositRequest{
		WalletID: fiat.ID, Amount: usd, IdempotencyKey: key(t, "seed-dep"),
	}); err != nil {
		t.Fatal(err)
	}
	correlation := "seed-" + usdxWallet.ID
	if _, err := free.Issue(ctx, IssueRequest{
		FiatWalletID: fiat.ID, USDXWalletID: usdxWallet.ID, Amount: usd,
		IdempotencyKey: key(t, "seed-issue"), CorrelationID: correlation,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := free.ConfirmUSDXCredit(ctx, usdxWallet.ID, amount, correlation, "0xseed"); err != nil {
		t.Fatal(err)
	}
	balanceOf(t, repo, ctx, usdxWallet.AccountID, amount.String())
}

func mustBalance(t *testing.T, repo *Repository, ctx context.Context, accountID string) *big.Int {
	t.Helper()
	b, err := repo.Balance(ctx, accountID)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func mustBalanceGL(t *testing.T, repo *Repository, ctx context.Context, glCode string) *big.Int {
	t.Helper()
	b, err := repo.BalanceByGLCode(ctx, glCode)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func assertDelta(t *testing.T, repo *Repository, ctx context.Context, glCode string, before *big.Int, want string) {
	t.Helper()
	now := mustBalanceGL(t, repo, ctx, glCode)
	if got := new(big.Int).Sub(now, before).String(); got != want {
		t.Fatalf("%s moved by %s, want %s", glCode, got, want)
	}
}

// assertLedgerHealthy is the check that matters most: every account's O(1)
// running balance still agrees with the O(n) sum of its own history.
func assertLedgerHealthy(t *testing.T, repo *Repository, ctx context.Context) {
	t.Helper()
	divergences, err := repo.VerifyRunningBalances(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range divergences {
		t.Errorf("%s: running balance %s but entries sum to %s", d.GLCode, d.Running, d.Derived)
	}
}
