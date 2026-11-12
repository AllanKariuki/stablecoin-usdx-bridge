package bridge_test

import (
	"fmt"
	"math/big"
	"testing"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/signerclient"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
)

// A signer refusal arrives from inside BridgeMint/BridgeBurn, before a tx hash
// is recorded — the one window in which an earlier attempt may have signed and
// broadcast without the saga knowing. So at every stage a refusal parks the
// saga: no retry (it would be refused again), and no unwinding (an earlier
// signature may yet land). Each test asserts both halves, plus that resolving
// the dead letter is what lets the saga go again.

// ethWrapped and solWrapped are how each chain client hands a signer refusal back: Ethereum's
// through bind and "bridgeMint tx: %w", Solana's through "signing
// transaction: %w". The saga sees only these.
func ethWrapped(err error) error { return fmt.Errorf("bridgeMint tx: %w", err) }
func solWrapped(err error) error { return fmt.Errorf("signing transaction: %w", err) }

// openDeadLetter returns the saga's unresolved dead letter, failing if there
// is none. The table is shared with every other test in the database, so the
// queue is read whole rather than assumed short.
func (f *fixture) openDeadLetter(t *testing.T, correlationID string) ledger.SagaDeadLetter {
	t.Helper()
	open, err := f.repo.OpenDeadLetters(f.ctx, 1_000_000)
	if err != nil {
		t.Fatalf("reading dead letters: %v", err)
	}
	for _, dl := range open {
		if dl.CorrelationID == correlationID {
			return dl
		}
	}
	t.Fatalf("saga %s was not dead-lettered", correlationID)
	return ledger.SagaDeadLetter{}
}

// assertParked is the common half: not retried, not settled, dead-lettered at
// the stage the refusal came from, and not claimable while the letter is open.
func (f *fixture) assertParked(t *testing.T, res bridge.Result, correlationID, stage string, wantStatus ledger.TransferStatus) {
	t.Helper()
	if !res.Failed() || res.Retry {
		t.Fatalf("a signer refusal must fail without a retry, got %+v", res)
	}
	if res.Stage != stage {
		t.Fatalf("stage = %s, want %s", res.Stage, stage)
	}
	if got := f.status(t, correlationID); got != wantStatus {
		t.Fatalf("status = %s, want %s; a refusal parks the saga where it stood", got, wantStatus)
	}
	if dl := f.openDeadLetter(t, correlationID); dl.Stage != stage {
		t.Fatalf("dead letter stage = %s, want %s", dl.Stage, stage)
	}
}

// fundBridge seeds the Ethereum wallet through a completed mint and enqueues
// an Ethereum -> Solana bridge of 100 USD-X.
func (f *fixture) fundBridge(t *testing.T) (correlationID string, solana *ledger.Wallet) {
	t.Helper()
	if res := f.saga.Execute(f.ctx, f.issue(t, 300_00)); res.Failed() {
		t.Fatalf("seeding mint failed: %+v", res)
	}
	solana, err := f.repo.EnsureWallet(f.ctx, f.user, "USDX", "SOLANA", "So11111111111111111111111111111111111111112", "USD-X Solana")
	if err != nil {
		t.Fatalf("EnsureWallet SOLANA: %v", err)
	}
	correlationID = f.key("bridge-saga")
	if _, err := f.repo.UpsertTransfer(f.ctx, &ledger.BridgeTransfer{
		CorrelationID:  correlationID,
		Kind:           ledger.SagaBridge,
		SourceAddress:  f.usdxWallet.Address,
		TargetAddress:  solana.Address,
		Amount:         big.NewInt(100_000000),
		SourceChain:    f.usdxWallet.Chain,
		TargetChain:    solana.Chain,
		Status:         ledger.StatusPending,
		UserID:         f.user,
		SourceWalletID: f.usdxWallet.ID,
		TargetWalletID: solana.ID,
	}); err != nil {
		t.Fatalf("UpsertTransfer: %v", err)
	}
	return correlationID, solana
}

// MINT refused at the first chain call. The issuance is NOT reversed: the
// policy may be one an operator lifts (a limit, a ceiling), and a refusal can
// as easily follow an earlier signed attempt as precede any.
func TestSagaParksAMintTheSignerRefuses(t *testing.T) {
	f := newFixture(t)
	correlationID := f.issue(t, 80_00)

	refuse := true
	f.chain.mintErr = func(int) error {
		if refuse {
			return ethWrapped(&signerclient.PolicyDeniedError{Reason: "amount exceeds the per-call ceiling"})
		}
		return nil
	}

	res := f.saga.Execute(f.ctx, correlationID)
	f.assertParked(t, res, correlationID, bridge.StageMintChain, ledger.StatusPending)

	if got := f.balance(t, f.usdWallet.AccountID); got != "0" {
		t.Fatalf("USD balance = %s, want 0; a refusal must not reverse the issuance", got)
	}
	if got := f.balance(t, f.usdxWallet.AccountID); got != "0" {
		t.Fatalf("USD-X balance = %s, want 0; nothing was minted", got)
	}
	if got := f.chain.mints(); got != 1 {
		t.Fatalf("BridgeMint called %d times, want 1; a refusal is not retried in-attempt", got)
	}

	// The operator raises the ceiling and resolves: the saga resumes from
	// PENDING with a fresh budget and completes.
	refuse = false
	if err := f.repo.ResolveDeadLetter(f.ctx, correlationID, "ops", "ceiling raised"); err != nil {
		t.Fatalf("ResolveDeadLetter: %v", err)
	}
	if res := f.saga.Execute(f.ctx, correlationID); res.Failed() {
		t.Fatalf("resumed attempt failed: %+v", res)
	}
	if got := f.status(t, correlationID); got != ledger.StatusCompleted {
		t.Fatalf("status = %s, want COMPLETED", got)
	}
	if got := f.balance(t, f.usdxWallet.AccountID); got != "80000000" {
		t.Fatalf("USD-X balance = %s, want 80000000 (credited once)", got)
	}
}

// BRIDGE refused at the source burn. The ledger reservation stays posted —
// releasing it while a previously signed burn could still land would let
// the user spend value the chain has destroyed.
func TestSagaParksABridgeBurnTheSignerRefuses(t *testing.T) {
	f := newFixture(t)
	correlationID, solana := f.fundBridge(t)

	f.chain.burnErr = func(int) error {
		return ethWrapped(&signerclient.CorrelationReusedError{Reason: "already signed for a different payload"})
	}

	res := f.saga.Execute(f.ctx, correlationID)
	f.assertParked(t, res, correlationID, bridge.StageBurnChain, ledger.StatusPending)

	if got := f.balance(t, f.usdxWallet.AccountID); got != "200000000" {
		t.Fatalf("Ethereum USD-X = %s, want 200000000; the reservation must stay posted", got)
	}
	if got := f.balance(t, solana.AccountID); got != "0" {
		t.Fatalf("Solana USD-X = %s, want 0", got)
	}
	// Only the seeding issuance minted. No destination mint, no compensation.
	if got := f.chain.mints(); got != 1 {
		t.Fatalf("BridgeMint called %d times, want 1 (the seeding issuance only)", got)
	}
}

// BRIDGE refused at the destination mint, after the source burn is final.
// This is where ClassTerminal would compensate by re-minting on the source
// chain. A refusal must not: an earlier signed destination mint could still
// land, and then the value would exist on both chains.
func TestSagaParksABridgeMintTheSignerRefusesWithoutCompensating(t *testing.T) {
	f := newFixture(t)
	correlationID, solana := f.fundBridge(t)

	f.chain.mintErr = func(n int) error {
		if n == 1 {
			return nil // the seeding issuance
		}
		return solWrapped(&signerclient.ResignLimitError{Reason: "re-signed 5 times"})
	}

	res := f.saga.Execute(f.ctx, correlationID)
	f.assertParked(t, res, correlationID, bridge.StageMintChain, ledger.StatusBurnConfirmed)

	// Seeding mint + the refused destination mint, and no third call: a
	// compensation would have been a BridgeMint on the source chain.
	if got := f.chain.mints(); got != 2 {
		t.Fatalf("BridgeMint called %d times, want 2; a refusal must never compensate", got)
	}
	if got := f.chain.burns(); got != 1 {
		t.Fatalf("BridgeBurn called %d times, want 1", got)
	}
	// The burned 100 sits in transit: not back on the source, not on the target.
	if got := f.balance(t, f.usdxWallet.AccountID); got != "200000000" {
		t.Fatalf("Ethereum USD-X = %s, want 200000000; nothing may be compensated", got)
	}
	if got := f.balance(t, solana.AccountID); got != "0" {
		t.Fatalf("Solana USD-X = %s, want 0", got)
	}
	if got := f.status(t, correlationID); got == ledger.StatusCompensated {
		t.Fatal("a refused mint was compensated")
	}
}

// REDEEM refused at the burn. The USD-X stays in suspense rather than going
// back to a wallet whose tokens an earlier signed burn may yet destroy — and
// no fiat is released for a burn nobody has seen.
func TestSagaParksARedemptionTheSignerRefuses(t *testing.T) {
	f := newFixture(t)
	if res := f.saga.Execute(f.ctx, f.issue(t, 200_00)); res.Failed() {
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
		SourceAddress:  f.usdxWallet.Address,
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
		return ethWrapped(&signerclient.PolicyDeniedError{Reason: "daily limit reached"})
	}

	res := f.saga.Execute(f.ctx, redeemCorrelation)
	f.assertParked(t, res, redeemCorrelation, bridge.StageBurnChain, ledger.StatusPending)

	if got := f.balance(t, f.usdxWallet.AccountID); got != "150000000" {
		t.Fatalf("USD-X = %s, want 150000000; the redemption must not be reversed", got)
	}
	if got := f.balance(t, f.usdWallet.AccountID); got != "0" {
		t.Fatalf("USD = %s, want 0; no fiat for an unseen burn", got)
	}
}

// Contrast with the above: the same chain error without the signer's type is
// still an ordinary terminal revert and still unwinds, so the refusal path
// has not swallowed the classification it sits beside.
func TestSagaStillUnwindsAnUntypedRevert(t *testing.T) {
	f := newFixture(t)
	correlationID := f.issue(t, 60_00)

	f.chain.mintErr = func(int) error { return ethWrapped(fmt.Errorf("execution reverted: Pausable: paused")) }

	res := f.saga.Execute(f.ctx, correlationID)
	if res.Retry {
		t.Fatalf("a revert must not be retryable, got %+v", res)
	}
	if got := f.status(t, correlationID); got != ledger.StatusFailed {
		t.Fatalf("status = %s, want FAILED", got)
	}
	if got := f.balance(t, f.usdWallet.AccountID); got != "6000" {
		t.Fatalf("USD balance = %s, want 6000 (issuance reversed)", got)
	}
}
