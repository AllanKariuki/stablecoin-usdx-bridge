package worker

// Integration test: needs Postgres, like the saga suite it sits beside.
//
//	LEDGER_TEST_DATABASE_URL='postgres://bridge:bridge@localhost:55433/bridge_test?sslmode=disable' \
//	  go test ./internal/worker/ -v

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/retry"
)

// slowFinality mints successfully and reports the first n finality waits as
// included-but-not-final, the way Sepolia does for 13 to 19 minutes.
type slowFinality struct {
	mu        sync.Mutex
	mints     int
	waits     int
	notFinalN int
}

func (c *slowFinality) BridgeMint(string, *big.Int, string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.mints++
	return "0xmint", nil
}

func (c *slowFinality) BridgeBurn(string, *big.Int, string) (string, error) {
	return "0xburn", nil
}

func (c *slowFinality) WaitForFinality(string, string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.waits++
	if c.waits <= c.notFinalN {
		return fmt.Errorf("timed out waiting for block 1 to finalize: %w: %w", bridge.ErrNotFinal, context.DeadlineExceeded)
	}
	return nil
}

func TestNotFinalYetDoesNotSpendTheBudget(t *testing.T) {
	dsn := os.Getenv("LEDGER_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set LEDGER_TEST_DATABASE_URL to run worker integration tests")
	}
	ctx := context.Background()
	repo, err := ledger.NewRepository(dsn)
	if err != nil {
		t.Fatalf("connecting: %v", err)
	}
	if err := repo.Bootstrap(ctx, ledger.DefaultCurrencies()); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}

	svc := ledger.NewService(repo, ledger.FeeSchedule{})
	chain := &slowFinality{notFinalN: 3}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	saga := bridge.NewSaga(repo, svc, bridge.NewRouter(chain, chain), logger)

	// A budget of one: if a not-final wait were charged as a failed attempt,
	// the very first one would dead-letter this saga.
	cfg := DefaultConfig()
	cfg.RetryPolicy = retry.Policy{Base: time.Millisecond, Max: time.Millisecond, Budget: 1}
	w := New(repo, saga, logger, cfg)

	user := "worker-" + time.Now().UTC().Format("20060102150405.000000000")
	usd, err := repo.EnsureWallet(ctx, user, "USD", "", "", "Main")
	if err != nil {
		t.Fatalf("EnsureWallet USD: %v", err)
	}
	usdx, err := repo.EnsureWallet(ctx, user, "USDX", "ETHEREUM", "0x00000000000000000000000000000000000000E1", "USD-X")
	if err != nil {
		t.Fatalf("EnsureWallet USDX: %v", err)
	}
	if _, err := svc.Deposit(ctx, ledger.DepositRequest{
		WalletID: usd.ID, Amount: big.NewInt(10000), IdempotencyKey: user + ":dep", BankRef: "BANK-1",
	}); err != nil {
		t.Fatalf("Deposit: %v", err)
	}
	correlationID := user + ":mint"
	tx, err := svc.Issue(ctx, ledger.IssueRequest{
		FiatWalletID: usd.ID, USDXWalletID: usdx.ID, Amount: big.NewInt(10000),
		IdempotencyKey: user + ":iss", CorrelationID: correlationID,
	})
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	amount, _ := new(big.Int).SetString(tx.Metadata["usdx_amount"].(string), 10)
	if _, err := repo.UpsertTransfer(ctx, &ledger.BridgeTransfer{
		CorrelationID: correlationID, Kind: ledger.SagaMint, TargetAddress: usdx.Address,
		Amount: amount, TargetChain: usdx.Chain, Status: ledger.StatusPending,
		UserID: user, TargetWalletID: usdx.ID, LedgerTxID: tx.ID,
	}); err != nil {
		t.Fatalf("UpsertTransfer: %v", err)
	}

	for i := 1; i <= chain.notFinalN; i++ {
		tr, err := repo.FindByCorrelationID(correlationID)
		if err != nil {
			t.Fatalf("loading transfer: %v", err)
		}
		tr.Attempts = 1 // what a claim would have counted
		w.process(ctx, tr)

		after, err := repo.FindByCorrelationID(correlationID)
		if err != nil {
			t.Fatalf("loading transfer: %v", err)
		}
		if after.Status != ledger.StatusMintSubmitted {
			t.Fatalf("wait %d: status %s, want MINT_SUBMITTED", i, after.Status)
		}
		if after.LastError != "" {
			t.Fatalf("wait %d: recorded as a failure: %q", i, after.LastError)
		}
		if d := time.Until(after.NextAttemptAt); d <= 0 || d > cfg.FinalityRecheck+time.Second {
			t.Fatalf("wait %d: next attempt in %s, want about %s", i, d, cfg.FinalityRecheck)
		}
	}

	dead, err := repo.OpenDeadLetters(ctx, 100000)
	if err != nil {
		t.Fatalf("listing dead letters: %v", err)
	}
	for _, d := range dead {
		if d.CorrelationID == correlationID {
			t.Fatal("a saga that was only waiting on finality was dead-lettered")
		}
	}

	tr, err := repo.FindByCorrelationID(correlationID)
	if err != nil {
		t.Fatalf("loading transfer: %v", err)
	}
	w.process(ctx, tr)
	final, err := repo.FindByCorrelationID(correlationID)
	if err != nil {
		t.Fatalf("loading transfer: %v", err)
	}
	if final.Status != ledger.StatusCompleted {
		t.Fatalf("status %s once final, want COMPLETED", final.Status)
	}
	if chain.mints != 1 {
		t.Fatalf("minted %d times, want 1", chain.mints)
	}
}
