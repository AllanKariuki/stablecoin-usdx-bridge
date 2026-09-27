// Package bridge_test is an external test package so it can drive the saga
// through internal/ledger, which internal/bridge already imports.
package bridge_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"math/big"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
)

// The saga is tested against a real PostgreSQL instance because the things
// worth doubting about it are database guarantees: the advisory lock, the
// idempotency key behind every re-posting, the status transitions a resumed
// run reads. The chains are faked, because what is under test is what the
// saga does about a chain's answer, not the chain.
//
//	docker compose up -d postgres
//	LEDGER_TEST_DATABASE_URL='postgres://bridge:bridge@localhost:55433/bridge?sslmode=disable' \
//	  go test ./internal/bridge -run TestSagaResumesAfterCrash -count=20

// fakeChain records every call and lets a test decide what the nth one
// returns. Counting calls is the point: "resumed without double-minting" is
// exactly the claim that BridgeMint was invoked once.
type fakeChain struct {
	mu sync.Mutex

	mintCalls int
	burnCalls int
	waitCalls int

	// Set by the test. n is 1-based.
	mintErr func(n int) error
	burnErr func(n int) error
	waitErr func(n int) error
}

func (f *fakeChain) BridgeMint(to string, amount *big.Int, correlationID string) (string, error) {
	f.mu.Lock()
	f.mintCalls++
	n := f.mintCalls
	fn := f.mintErr
	f.mu.Unlock()

	if fn != nil {
		if err := fn(n); err != nil {
			return "", err
		}
	}
	return "0xmint", nil
}

func (f *fakeChain) BridgeBurn(from string, amount *big.Int, correlationID string) (string, error) {
	f.mu.Lock()
	f.burnCalls++
	n := f.burnCalls
	fn := f.burnErr
	f.mu.Unlock()

	if fn != nil {
		if err := fn(n); err != nil {
			return "", err
		}
	}
	return "0xburn", nil
}

func (f *fakeChain) WaitForFinality(txHash string, param string) error {
	f.mu.Lock()
	f.waitCalls++
	n := f.waitCalls
	fn := f.waitErr
	f.mu.Unlock()

	if fn != nil {
		return fn(n)
	}
	return nil
}

func (f *fakeChain) mints() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.mintCalls
}

func (f *fakeChain) burns() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.burnCalls
}

type fixture struct {
	repo  *ledger.Repository
	svc   *ledger.Service
	saga  *bridge.Saga
	chain *fakeChain
	ctx   context.Context

	user       string
	usdWallet  *ledger.Wallet
	usdxWallet *ledger.Wallet
}

// One repository for the whole test binary. Each Repository carries its own
// connection pool, so building one per subtest exhausts Postgres's
// max_connections long before the assertions get interesting — especially
// under the -count=20 the phase's verify step runs.
var (
	sharedOnce sync.Once
	sharedRepo *ledger.Repository
	sharedErr  error
)

func repository(t *testing.T) *ledger.Repository {
	t.Helper()
	dsn := os.Getenv("LEDGER_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set LEDGER_TEST_DATABASE_URL to run bridge saga integration tests")
	}
	sharedOnce.Do(func() {
		sharedRepo, sharedErr = ledger.NewRepository(dsn)
		if sharedErr == nil {
			sharedErr = sharedRepo.Bootstrap(context.Background(), ledger.DefaultCurrencies())
		}
	})
	if sharedErr != nil {
		t.Fatalf("connecting: %v", sharedErr)
	}
	return sharedRepo
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	repo := repository(t)
	ctx := context.Background()

	// Zero fees keep the arithmetic in the assertions about the saga rather
	// than about basis points, which fx_test and posting_test already cover.
	svc := ledger.NewService(repo, ledger.FeeSchedule{})
	chain := &fakeChain{}
	router := bridge.NewRouter(chain, chain)
	saga := bridge.NewSaga(repo, svc, router, slog.New(slog.NewTextHandler(io.Discard, nil)))

	user := "saga-" + t.Name() + "-" + time.Now().UTC().Format("20060102150405.000000000")
	usd, err := repo.EnsureWallet(ctx, user, "USD", "", "", "Main")
	if err != nil {
		t.Fatalf("EnsureWallet USD: %v", err)
	}
	usdx, err := repo.EnsureWallet(ctx, user, "USDX", "ETHEREUM", "0xUSER", "USD-X")
	if err != nil {
		t.Fatalf("EnsureWallet USDX: %v", err)
	}

	return &fixture{repo: repo, svc: svc, saga: saga, chain: chain, ctx: ctx,
		user: user, usdWallet: usd, usdxWallet: usdx}
}

func (f *fixture) key(suffix string) string {
	return f.user + ":" + suffix
}

// issue deposits and issues, then enqueues the MINT saga exactly as
// POST /issuances does, and returns the correlation id.
func (f *fixture) issue(t *testing.T, usd int64) string {
	t.Helper()

	if _, err := f.svc.Deposit(f.ctx, ledger.DepositRequest{
		WalletID: f.usdWallet.ID, Amount: big.NewInt(usd),
		IdempotencyKey: f.key("dep"), BankRef: "BANK-1",
	}); err != nil {
		t.Fatalf("Deposit: %v", err)
	}

	correlationID := f.key("mint-saga")
	tx, err := f.svc.Issue(f.ctx, ledger.IssueRequest{
		FiatWalletID: f.usdWallet.ID, USDXWalletID: f.usdxWallet.ID,
		Amount: big.NewInt(usd), IdempotencyKey: f.key("iss"), CorrelationID: correlationID,
	})
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	usdxAmount, ok := new(big.Int).SetString(tx.Metadata["usdx_amount"].(string), 10)
	if !ok {
		t.Fatal("issuance is missing its USD-X amount")
	}

	if _, err := f.repo.UpsertTransfer(f.ctx, &ledger.BridgeTransfer{
		CorrelationID:  correlationID,
		Kind:           ledger.SagaMint,
		UserAddress:    f.usdxWallet.Address,
		Amount:         usdxAmount,
		TargetChain:    f.usdxWallet.Chain,
		Status:         ledger.StatusPending,
		UserID:         f.user,
		TargetWalletID: f.usdxWallet.ID,
		LedgerTxID:     tx.ID,
	}); err != nil {
		t.Fatalf("UpsertTransfer: %v", err)
	}
	return correlationID
}

func (f *fixture) balance(t *testing.T, accountID string) string {
	t.Helper()
	bal, err := f.repo.Balance(f.ctx, accountID)
	if err != nil {
		t.Fatalf("reading balance: %v", err)
	}
	return bal.String()
}

func (f *fixture) status(t *testing.T, correlationID string) ledger.TransferStatus {
	t.Helper()
	tr, err := f.repo.FindByCorrelationID(correlationID)
	if err != nil {
		t.Fatalf("loading transfer: %v", err)
	}
	return tr.Status
}

// TestSagaResumesAfterCrash is the phase's headline guarantee: a worker killed
// mid-flight leaves nothing stranded and nothing doubled.
func TestSagaResumesAfterCrash(t *testing.T) {
	t.Run("finality timeout resumes onto the same mint", func(t *testing.T) {
		f := newFixture(t)
		correlationID := f.issue(t, 250_00)

		// The mint lands; the wait for finality times out, which is exactly
		// what a killed worker or a slow RPC endpoint looks like from here.
		f.chain.waitErr = func(n int) error {
			if n == 1 {
				return errors.New("timed out waiting for tx 0xmint to finalize")
			}
			return nil
		}

		first := f.saga.Execute(f.ctx, correlationID)
		if !first.Retry {
			t.Fatalf("a finality timeout must be retryable, got %+v", first)
		}
		if got := f.status(t, correlationID); got != ledger.StatusMintSubmitted {
			t.Fatalf("status after the submitted mint = %s, want MINT_SUBMITTED", got)
		}

		second := f.saga.Execute(f.ctx, correlationID)
		if second.Failed() {
			t.Fatalf("resumed attempt failed: %+v", second)
		}

		if got := f.chain.mints(); got != 1 {
			t.Fatalf("BridgeMint was called %d times; a resumed saga must not re-submit", got)
		}
		if got := f.status(t, correlationID); got != ledger.StatusCompleted {
			t.Fatalf("status = %s, want COMPLETED", got)
		}
		// 250.00 USD at 2dp became 250.000000 USD-X at 6dp.
		if got := f.balance(t, f.usdxWallet.AccountID); got != "250000000" {
			t.Fatalf("USD-X balance = %s, want 250000000", got)
		}
		if got := f.balance(t, f.usdWallet.AccountID); got != "0" {
			t.Fatalf("USD balance = %s, want 0", got)
		}
	})

	t.Run("a crash that lost the tx hash does not mint twice", func(t *testing.T) {
		f := newFixture(t)
		correlationID := f.issue(t, 100_00)

		// The narrow window the hash-first ordering exists to cover: the RPC
		// returned, the process died before the hash was committed. On the
		// next attempt the chain's own replay guard answers.
		f.chain.mintErr = func(n int) error {
			if n >= 2 {
				return errors.New("execution reverted: already minted")
			}
			return nil
		}

		if res := f.saga.Execute(f.ctx, correlationID); res.Failed() {
			t.Fatalf("first attempt failed: %+v", res)
		}
		// Simulate the lost commit: the chain minted, the row didn't record it.
		if err := f.repo.RecordChainTx(f.ctx, correlationID, "dest_tx_hash", ""); err != nil {
			t.Fatalf("clearing dest_tx_hash: %v", err)
		}
		if err := f.repo.UpdateStatus(correlationID, ledger.StatusPending); err != nil {
			t.Fatalf("rewinding status: %v", err)
		}

		second := f.saga.Execute(f.ctx, correlationID)
		if second.Failed() {
			t.Fatalf("resumed attempt failed: %+v", second)
		}
		if got := f.status(t, correlationID); got != ledger.StatusCompleted {
			t.Fatalf("status = %s, want COMPLETED", got)
		}
		// The ledger was credited exactly once — the second BridgeIn posting
		// replays its idempotency key rather than crediting again.
		if got := f.balance(t, f.usdxWallet.AccountID); got != "100000000" {
			t.Fatalf("USD-X balance = %s, want 100000000 (credited exactly once)", got)
		}
		// And nothing was compensated: the user's fiat did not come back.
		if got := f.balance(t, f.usdWallet.AccountID); got != "0" {
			t.Fatalf("USD balance = %s, want 0; a replay guard must never trigger compensation", got)
		}
	})

	t.Run("transient failures never compensate", func(t *testing.T) {
		f := newFixture(t)
		correlationID := f.issue(t, 50_00)

		f.chain.mintErr = func(int) error {
			return errors.New("dial tcp 127.0.0.1:8545: connect: connection refused")
		}

		for i := 0; i < 3; i++ {
			res := f.saga.Execute(f.ctx, correlationID)
			if !res.Retry {
				t.Fatalf("attempt %d: a connection error must be retryable, got %+v", i+1, res)
			}
		}

		// This is the regression the old saga had: one transient error went
		// straight to compensation, un-minting a healthy transfer.
		if got := f.status(t, correlationID); got != ledger.StatusPending {
			t.Fatalf("status = %s, want PENDING; transient errors must not settle a saga", got)
		}
		if got := f.balance(t, f.usdWallet.AccountID); got != "0" {
			t.Fatalf("USD balance = %s, want 0; the issuance must not have been reversed", got)
		}
	})

	t.Run("a terminal failure reverses the issuance", func(t *testing.T) {
		f := newFixture(t)
		correlationID := f.issue(t, 75_00)

		f.chain.mintErr = func(int) error {
			return errors.New("execution reverted: Pausable: paused")
		}

		res := f.saga.Execute(f.ctx, correlationID)
		if res.Retry {
			t.Fatalf("a revert must not be retryable, got %+v", res)
		}
		if got := f.status(t, correlationID); got != ledger.StatusFailed {
			t.Fatalf("status = %s, want FAILED", got)
		}
		// The fiat is the user's again: nothing economically happened.
		if got := f.balance(t, f.usdWallet.AccountID); got != "7500" {
			t.Fatalf("USD balance = %s, want 7500 (the issuance reversed)", got)
		}
		if got := f.balance(t, f.usdxWallet.AccountID); got != "0" {
			t.Fatalf("USD-X balance = %s, want 0", got)
		}
	})
}

// TestSagaRedeemBurnsAndSettles covers the hole that made the peg one-way:
// before P2 a redemption posted its journal, returned 202, and no burn was
// ever submitted.
func TestSagaRedeemBurnsAndSettles(t *testing.T) {
	f := newFixture(t)

	// Get USD-X into the wallet the ordinary way, through a completed mint.
	mintCorrelation := f.issue(t, 250_00)
	if res := f.saga.Execute(f.ctx, mintCorrelation); res.Failed() {
		t.Fatalf("seeding mint failed: %+v", res)
	}

	redeemCorrelation := f.key("redeem-saga")
	redeemTx, err := f.svc.Redeem(f.ctx, ledger.RedeemRequest{
		USDXWalletID:   f.usdxWallet.ID,
		FiatWalletID:   f.usdWallet.ID,
		Amount:         big.NewInt(100_000000), // 100.00 USD-X at 6dp
		CorrelationID:  redeemCorrelation,
		IdempotencyKey: f.key("redeem"),
	})
	if err != nil {
		t.Fatalf("Redeem: %v", err)
	}

	if _, err := f.repo.UpsertTransfer(f.ctx, &ledger.BridgeTransfer{
		CorrelationID:  redeemCorrelation,
		Kind:           ledger.SagaRedeem,
		UserAddress:    f.usdxWallet.Address,
		Amount:         big.NewInt(100_000000),
		SourceChain:    f.usdxWallet.Chain,
		TargetChain:    "",
		Status:         ledger.StatusPending,
		UserID:         f.user,
		SourceWalletID: f.usdxWallet.ID,
		LedgerTxID:     redeemTx.ID,
	}); err != nil {
		t.Fatalf("UpsertTransfer: %v", err)
	}

	if res := f.saga.Execute(f.ctx, redeemCorrelation); res.Failed() {
		t.Fatalf("redemption saga failed: %+v", res)
	}

	if got := f.chain.burns(); got != 1 {
		t.Fatalf("BridgeBurn was called %d times, want 1", got)
	}
	if got := f.status(t, redeemCorrelation); got != ledger.StatusCompleted {
		t.Fatalf("status = %s, want COMPLETED", got)
	}
	if got := f.balance(t, f.usdxWallet.AccountID); got != "150000000" {
		t.Fatalf("USD-X balance = %s, want 150000000 (250 issued less 100 redeemed)", got)
	}
	if got := f.balance(t, f.usdWallet.AccountID); got != "10000" {
		t.Fatalf("USD balance = %s, want 10000 (100.00 released)", got)
	}
}

// TestSagaRedeemTerminalBurnReturnsTheTokens proves the other half: when the
// burn cannot happen, the user's USD-X comes back rather than sitting in
// suspense.
func TestSagaRedeemTerminalBurnReturnsTheTokens(t *testing.T) {
	f := newFixture(t)

	mintCorrelation := f.issue(t, 200_00)
	if res := f.saga.Execute(f.ctx, mintCorrelation); res.Failed() {
		t.Fatalf("seeding mint failed: %+v", res)
	}

	redeemCorrelation := f.key("redeem-saga")
	redeemTx, err := f.svc.Redeem(f.ctx, ledger.RedeemRequest{
		USDXWalletID:   f.usdxWallet.ID,
		FiatWalletID:   f.usdWallet.ID,
		Amount:         big.NewInt(50_000000),
		CorrelationID:  redeemCorrelation,
		IdempotencyKey: f.key("redeem"),
	})
	if err != nil {
		t.Fatalf("Redeem: %v", err)
	}
	if _, err := f.repo.UpsertTransfer(f.ctx, &ledger.BridgeTransfer{
		CorrelationID:  redeemCorrelation,
		Kind:           ledger.SagaRedeem,
		UserAddress:    f.usdxWallet.Address,
		Amount:         big.NewInt(50_000000),
		SourceChain:    f.usdxWallet.Chain,
		Status:         ledger.StatusPending,
		UserID:         f.user,
		SourceWalletID: f.usdxWallet.ID,
		LedgerTxID:     redeemTx.ID,
	}); err != nil {
		t.Fatalf("UpsertTransfer: %v", err)
	}

	f.chain.burnErr = func(int) error {
		return errors.New("execution reverted: account is blacklisted")
	}

	res := f.saga.Execute(f.ctx, redeemCorrelation)
	if res.Retry {
		t.Fatalf("a revert must not be retryable, got %+v", res)
	}
	if got := f.status(t, redeemCorrelation); got != ledger.StatusFailed {
		t.Fatalf("status = %s, want FAILED", got)
	}
	// All 200 USD-X back in the wallet: the redemption request was reversed.
	if got := f.balance(t, f.usdxWallet.AccountID); got != "200000000" {
		t.Fatalf("USD-X balance = %s, want 200000000 (redemption reversed)", got)
	}
	if got := f.balance(t, f.usdWallet.AccountID); got != "0" {
		t.Fatalf("USD balance = %s, want 0; no fiat may be released for a burn that never happened", got)
	}
}
