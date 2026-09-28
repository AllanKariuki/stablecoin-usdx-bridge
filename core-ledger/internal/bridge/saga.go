package bridge

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
)

// Stages name where a saga was standing when it stopped. They are recorded on
// dead letters, so the first question an operator asks — "did the chain call
// happen or not" — is answered by the row rather than by reading logs.
const (
	StageLock         = "LOCK"
	StageLoad         = "LOAD"
	StageRoute        = "ROUTE"
	StageBurnLedger   = "BURN_LEDGER"
	StageBurnChain    = "BURN_CHAIN"
	StageBurnFinality = "BURN_FINALITY"
	StageMintChain    = "MINT_CHAIN"
	StageMintFinality = "MINT_FINALITY"
	StageMintLedger   = "MINT_LEDGER"
	StageRedeemSettle = "REDEEM_SETTLE"
)

// ErrLockHeld means another worker is running this exact saga right now.
var ErrLockHeld = errors.New("another worker holds this saga")

// Result is what one attempt produced. The worker, not the saga, owns the
// retry schedule and the attempt budget — the saga only says whether another
// attempt could plausibly help.
type Result struct {
	Stage string
	Err   error

	// Retry is set when the attempt failed for a reason another attempt might
	// not hit. When it is false and Err is non-nil, the saga has already run
	// its recovery and settled itself; there is nothing left to schedule.
	Retry bool
}

func (r Result) Failed() bool { return r.Err != nil }

func retryable(stage string, err error) Result {
	return Result{Stage: stage, Err: err, Retry: true}
}

func settled(stage string, err error) Result {
	return Result{Stage: stage, Err: err}
}

type Saga struct {
	repo   *ledger.Repository
	ledger *ledger.Service
	router *Router
	logger *slog.Logger

	// Finality is the vocabulary both chain clients understand: Ethereum
	// reads "finalized" as the post-merge checkpoint or a confirmation count;
	// Solana reads it as a commitment level.
	Finality string
}

func NewSaga(repo *ledger.Repository, svc *ledger.Service, router *Router, logger *slog.Logger) *Saga {
	return &Saga{repo: repo, ledger: svc, router: router, logger: logger, Finality: "finalized"}
}

// Execute runs one attempt at the saga identified by correlationID.
//
// Three shapes run through here, and which one is no longer inferred from
// whether SourceChain happens to be empty — BridgeTransfer.Kind says so
// outright, which is what makes a redemption expressible at all:
//
//   - MINT: fiat became USD-X. ledger.Service.Issue already journalled the
//     fiat side and parked the USD-X in suspense; all that remains is to mint
//     on the target chain and release it into the wallet.
//
//   - BRIDGE: the user's USD-X moves chain to chain, wallet -> suspense ->
//     wallet in the journal, mirroring burn -> in flight -> mint on the
//     chains.
//
//   - REDEEM: USD-X becomes fiat again. This is the path that did not exist:
//     POST /redemptions posted the journal, returned 202, and no burn was
//     ever submitted, so the USD-X sat in suspense forever and the peg was
//     one-way.
//
// Every step is re-entrant. A chain call is skipped when its tx hash is
// already recorded, and every ledger posting carries a correlation-derived
// idempotency key, so a resumed run re-posts nothing and re-submits nothing.
func (s *Saga) Execute(ctx context.Context, correlationID string) Result {
	var result Result

	// The lease already stops two workers claiming one saga. This stops what
	// a lease cannot see: one process entering Execute twice for the same
	// correlation id — a boot sweep racing the claim loop, or an operator
	// replay landing on a scheduled attempt. The lock lives in the same
	// database as the money, so it cannot be held by a process that has lost
	// its connection.
	acquired, err := s.repo.WithAdvisoryLock(ctx, "saga:"+correlationID, func() error {
		result = s.run(ctx, correlationID)
		return nil
	})
	if err != nil {
		return retryable(StageLock, fmt.Errorf("taking the saga advisory lock: %w", err))
	}
	if !acquired {
		return retryable(StageLock, ErrLockHeld)
	}
	return result
}

func (s *Saga) run(ctx context.Context, correlationID string) Result {
	t, err := s.repo.FindByCorrelationID(correlationID)
	if err != nil {
		return retryable(StageLoad, fmt.Errorf("loading transfer %s: %w", correlationID, err))
	}
	if t.Status.Terminal() {
		return Result{}
	}

	switch t.Kind {
	case ledger.SagaRedeem:
		return s.runRedeem(ctx, t)
	case ledger.SagaMint, ledger.SagaBridge:
		return s.runIssuanceOrBridge(ctx, t)
	default:
		// Unreachable through the API — the CHECK constraint and
		// UpsertTransfer both reject it — but a hand-edited row shouldn't
		// silently do nothing, and must not be re-claimed forever either.
		err := fmt.Errorf("saga %s has unknown kind %q", correlationID, t.Kind)
		s.settleFailed(ctx, t, StageRoute, err)
		return settled(StageRoute, err)
	}
}

// ---------------------------------------------------------------------------
// MINT and BRIDGE
// ---------------------------------------------------------------------------

func (s *Saga) runIssuanceOrBridge(ctx context.Context, t *ledger.BridgeTransfer) Result {
	targetClient, ok := s.router.For(t.TargetChain)
	if !ok {
		err := fmt.Errorf("unknown target_chain %q", t.TargetChain)
		s.recoverTerminal(ctx, t, StageRoute, err)
		return settled(StageRoute, err)
	}

	isBridge := t.Kind == ledger.SagaBridge
	var sourceClient ChainClient
	if isBridge {
		sourceClient, ok = s.router.For(t.SourceChain)
		if !ok {
			err := fmt.Errorf("unknown source_chain %q", t.SourceChain)
			s.recoverTerminal(ctx, t, StageRoute, err)
			return settled(StageRoute, err)
		}
	}

	if isBridge && t.Status == ledger.StatusPending {
		if res := s.burnSourceLeg(ctx, t, sourceClient); res.Failed() {
			return res
		}
	}

	// A crash between BridgeMint returning and the hash being committed is the
	// window that used to double-mint: the hash is recorded before anything
	// else, so a resumed attempt waits on the existing transaction instead of
	// submitting a second one.
	if t.DestTxHash == "" {
		txHash, err := targetClient.BridgeMint(t.TargetAddress, t.Amount, t.CorrelationID)
		switch {
		case err == nil:
			if err := s.repo.RecordChainTx(ctx, t.CorrelationID, "dest_tx_hash", txHash); err != nil {
				return retryable(StageMintChain, err)
			}
			t.DestTxHash = txHash
			_ = s.repo.UpdateStatus(t.CorrelationID, ledger.StatusMintSubmitted)

		case Classify(err) == ClassAlreadyProcessed:
			// The chain's replay guard says this correlation id was already
			// minted — by a previous attempt that died before recording its
			// hash. The tokens exist. Compensating would destroy real money,
			// so the journal is credited and a human is asked to backfill the
			// hash from the chain.
			s.logger.Warn("target chain reports this correlation id already minted; crediting the ledger without a tx hash",
				slog.String("correlation_id", t.CorrelationID), slog.Any("error", err))
			_ = s.repo.DeadLetter(ctx, t, StageMintChain,
				"minted on chain under this correlation id before the tx hash was recorded; backfill dest_tx_hash from the chain")

		case Classify(err) == ClassTerminal:
			s.recoverTerminal(ctx, t, StageMintChain, err)
			return settled(StageMintChain, err)

		default:
			return retryable(StageMintChain, err)
		}
	}

	if t.DestTxHash != "" {
		if err := targetClient.WaitForFinality(t.DestTxHash, s.Finality); err != nil {
			if Classify(err) == ClassTerminal {
				s.recoverTerminal(ctx, t, StageMintFinality, err)
				return settled(StageMintFinality, err)
			}
			return retryable(StageMintFinality, err)
		}
	}

	// The tokens now exist on the destination chain, so the journal can
	// release them from suspense into the user's wallet. Both shapes post the
	// same movement and differ only in what the audit trail should show.
	var err error
	if isBridge {
		_, err = s.ledger.BridgeIn(ctx, t.TargetWalletID, t.Amount, t.CorrelationID, t.DestTxHash)
	} else {
		_, err = s.ledger.ConfirmUSDXCredit(ctx, t.TargetWalletID, t.Amount, t.CorrelationID, t.DestTxHash)
	}
	if err != nil {
		// The chain is ahead of the ledger: tokens are minted but the journal
		// still parks them in suspense. There is nothing to compensate — the
		// mint is real — so the status stays honest and reconciliation sees
		// the suspense balance disagree with on-chain supply, which is
		// precisely the condition a human should be woken for.
		s.logger.Error("minted on chain but the ledger credit failed; needs manual intervention",
			slog.String("correlation_id", t.CorrelationID), slog.Any("error", err))
		return retryable(StageMintLedger, err)
	}

	if err := s.repo.SettleTransfer(ctx, t.CorrelationID, ledger.StatusCompleted, ""); err != nil {
		return retryable(StageMintLedger, err)
	}
	return Result{}
}

// burnSourceLeg reserves the funds in the journal and burns them on the source
// chain. The journal always precedes the chain call it represents: burning
// before the ledger says the user can afford it would let two concurrent
// bridges spend one balance, and a crash between the two leaves value visibly
// parked in suspense rather than silently doubled or lost.
func (s *Saga) burnSourceLeg(ctx context.Context, t *ledger.BridgeTransfer, sourceClient ChainClient) Result {
	if _, err := s.ledger.BridgeOut(ctx, t.SourceWalletID, t.Amount, t.CorrelationID, ""); err != nil {
		if isPostingRejection(err) {
			// Overdrawn, frozen, closed period: another attempt produces the
			// same rejection.
			s.recoverTerminal(ctx, t, StageBurnLedger, err)
			return settled(StageBurnLedger, err)
		}
		return retryable(StageBurnLedger, err)
	}

	if t.SourceTxHash == "" {
		txHash, err := sourceClient.BridgeBurn(t.SourceAddress, t.Amount, t.CorrelationID)
		switch {
		case err == nil:
			if err := s.repo.RecordChainTx(ctx, t.CorrelationID, "source_tx_hash", txHash); err != nil {
				return retryable(StageBurnChain, err)
			}
			t.SourceTxHash = txHash

		case Classify(err) == ClassAlreadyProcessed:
			s.logger.Warn("source chain reports this correlation id already burned; continuing without a tx hash",
				slog.String("correlation_id", t.CorrelationID), slog.Any("error", err))
			_ = s.repo.DeadLetter(ctx, t, StageBurnChain,
				"burned on chain under this correlation id before the tx hash was recorded; backfill source_tx_hash from the chain")

		case Classify(err) == ClassTerminal:
			s.recoverTerminal(ctx, t, StageBurnChain, err)
			return settled(StageBurnChain, err)

		default:
			return retryable(StageBurnChain, err)
		}
	}

	if t.SourceTxHash != "" {
		if err := sourceClient.WaitForFinality(t.SourceTxHash, s.Finality); err != nil {
			if Classify(err) == ClassTerminal {
				s.recoverTerminal(ctx, t, StageBurnFinality, err)
				return settled(StageBurnFinality, err)
			}
			return retryable(StageBurnFinality, err)
		}
	}

	if err := s.repo.UpdateStatus(t.CorrelationID, ledger.StatusBurnConfirmed); err != nil {
		return retryable(StageBurnFinality, err)
	}
	t.Status = ledger.StatusBurnConfirmed
	return Result{}
}

// ---------------------------------------------------------------------------
// REDEEM
// ---------------------------------------------------------------------------

// runRedeem closes the hole that made the peg one-way. POST /redemptions has
// already parked the user's USD-X in suspense; this burns it on chain and then
// calls ConfirmRedemption, which releases the fiat.
func (s *Saga) runRedeem(ctx context.Context, t *ledger.BridgeTransfer) Result {
	sourceClient, ok := s.router.For(t.SourceChain)
	if !ok {
		err := fmt.Errorf("unknown source_chain %q", t.SourceChain)
		s.recoverTerminal(ctx, t, StageRoute, err)
		return settled(StageRoute, err)
	}

	if t.Status == ledger.StatusPending {
		if t.SourceTxHash == "" {
			txHash, err := sourceClient.BridgeBurn(t.SourceAddress, t.Amount, t.CorrelationID)
			switch {
			case err == nil:
				if err := s.repo.RecordChainTx(ctx, t.CorrelationID, "source_tx_hash", txHash); err != nil {
					return retryable(StageBurnChain, err)
				}
				t.SourceTxHash = txHash

			case Classify(err) == ClassAlreadyProcessed:
				s.logger.Warn("source chain reports this redemption already burned; continuing without a tx hash",
					slog.String("correlation_id", t.CorrelationID), slog.Any("error", err))
				_ = s.repo.DeadLetter(ctx, t, StageBurnChain,
					"redemption burned on chain before the tx hash was recorded; backfill source_tx_hash from the chain")

			case Classify(err) == ClassTerminal:
				s.recoverTerminal(ctx, t, StageBurnChain, err)
				return settled(StageBurnChain, err)

			default:
				return retryable(StageBurnChain, err)
			}
		}

		if t.SourceTxHash != "" {
			if err := sourceClient.WaitForFinality(t.SourceTxHash, s.Finality); err != nil {
				if Classify(err) == ClassTerminal {
					s.recoverTerminal(ctx, t, StageBurnFinality, err)
					return settled(StageBurnFinality, err)
				}
				return retryable(StageBurnFinality, err)
			}
		}

		if err := s.repo.UpdateStatus(t.CorrelationID, ledger.StatusBurnConfirmed); err != nil {
			return retryable(StageBurnFinality, err)
		}
		t.Status = ledger.StatusBurnConfirmed
	}

	// The burn is final: the USD-X is gone from the chain for good. From here
	// nothing is compensable — re-minting to undo a settled redemption would
	// create supply against no backing — so every failure below retries until
	// a human takes it.
	if _, err := s.ledger.ConfirmRedemption(ctx, t.LedgerTxID, t.SourceTxHash, "", "bridge-saga"); err != nil {
		s.logger.Error("burn confirmed on chain but the redemption could not be settled in the ledger",
			slog.String("correlation_id", t.CorrelationID),
			slog.String("ledger_tx_id", t.LedgerTxID),
			slog.Any("error", err))
		return retryable(StageRedeemSettle, err)
	}

	if err := s.repo.SettleTransfer(ctx, t.CorrelationID, ledger.StatusCompleted, ""); err != nil {
		return retryable(StageRedeemSettle, err)
	}
	return Result{}
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

// recoverTerminal gives the money back, once, for a failure that will fail
// identically forever.
//
// It is reached only from a ClassTerminal error or a posting rejection —
// never from a timeout, and never from an exhausted attempt budget. That
// restriction is the entire point of the rework: the old saga compensated on
// the first error of any kind, so a 500ms RPC blip un-minted a healthy
// transfer and spawned a spurious mint to cover it.
func (s *Saga) recoverTerminal(ctx context.Context, t *ledger.BridgeTransfer, stage string, cause error) {
	s.logger.Warn("saga failed terminally, recovering",
		slog.String("correlation_id", t.CorrelationID),
		slog.String("kind", string(t.Kind)),
		slog.String("status", string(t.Status)),
		slog.String("stage", stage),
		slog.Any("error", cause))

	switch {
	case t.Kind == ledger.SagaMint:
		// Nothing was burned; the issuance was a bookkeeping event that turned
		// out not to be true, so it is reversed and the user's fiat returns.
		s.reverseByType(ctx, t, ledger.TxUSDXIssue, "mint failed, issuance reversed")
		s.settleFailed(ctx, t, stage, cause)

	case t.Kind == ledger.SagaRedeem && t.Status == ledger.StatusPending:
		// The burn never landed, so the USD-X parked in suspense goes straight
		// back to the wallet it came from.
		s.reverseLedgerTx(ctx, t, "redemption burn failed, request reversed")
		s.settleFailed(ctx, t, stage, cause)

	case t.Kind == ledger.SagaBridge && t.Status == ledger.StatusPending:
		// Nothing was destroyed on chain, so releasing the ledger reservation
		// is the whole of the recovery.
		s.reverseByType(ctx, t, ledger.TxChainBridgeOut, "source burn failed, reservation released")
		s.settleFailed(ctx, t, stage, cause)

	case t.Kind == ledger.SagaBridge:
		// The source burn succeeded and the destination mint cannot. The user
		// is not left holding value burned nowhere: it is re-minted on the
		// source chain under a fresh correlation id.
		s.compensate(ctx, t, cause)

	default:
		// REDEEM past BURN_CONFIRMED: the burn is real and irreversible.
		// Nothing here can be undone safely.
		s.settleFailed(ctx, t, stage, cause)
	}
}

func (s *Saga) settleFailed(ctx context.Context, t *ledger.BridgeTransfer, stage string, cause error) {
	if err := s.repo.SettleTransfer(ctx, t.CorrelationID, ledger.StatusFailed, cause.Error()); err != nil {
		s.logger.Error("could not mark saga failed",
			slog.String("correlation_id", t.CorrelationID), slog.Any("error", err))
	}
	if err := s.repo.DeadLetter(ctx, t, stage, cause.Error()); err != nil {
		s.logger.Error("could not dead-letter saga",
			slog.String("correlation_id", t.CorrelationID), slog.Any("error", err))
	}
}

// reverseByType reverses the journal transaction of a given type that this
// saga produced, found through the entity back-reference.
func (s *Saga) reverseByType(ctx context.Context, t *ledger.BridgeTransfer, typ ledger.TxType, reason string) {
	txs, err := s.repo.TransactionsForEntity(ctx, ledger.EntityBridgeTransfer, t.CorrelationID)
	if err != nil {
		s.logger.Error("could not load the saga's journal transactions to unwind",
			slog.String("correlation_id", t.CorrelationID), slog.Any("error", err))
		return
	}
	for _, tx := range txs {
		if tx.Type != typ || tx.Reversed {
			continue
		}
		if _, rerr := s.repo.Reverse(ctx, tx.ID, reason, "bridge-saga", ""); rerr != nil {
			s.logger.Error("could not reverse the saga's journal transaction; funds are stuck in suspense",
				slog.String("correlation_id", t.CorrelationID),
				slog.String("transaction_id", tx.ID),
				slog.Any("error", rerr))
		}
	}
}

// reverseLedgerTx reverses the exact transaction this saga settles. A
// redemption can't be found the way a bridge can: ledger.Service.Redeem stamps
// EntityType=WALLET, so an entity walk would match every redemption that
// wallet has ever made rather than this one — which is why the correlation
// carries ledger_tx_id explicitly.
func (s *Saga) reverseLedgerTx(ctx context.Context, t *ledger.BridgeTransfer, reason string) {
	if t.LedgerTxID == "" {
		s.logger.Error("saga has no ledger transaction to reverse; funds are stuck in suspense",
			slog.String("correlation_id", t.CorrelationID))
		return
	}
	if _, err := s.repo.Reverse(ctx, t.LedgerTxID, reason, "bridge-saga", ""); err != nil {
		s.logger.Error("could not reverse the redemption request; funds are stuck in suspense",
			slog.String("correlation_id", t.CorrelationID),
			slog.String("transaction_id", t.LedgerTxID),
			slog.Any("error", err))
	}
}

// compensate re-mints on the source chain after a confirmed burn whose
// destination mint terminally failed, then moves the journal's in-transit
// balance back to the source wallet.
func (s *Saga) compensate(ctx context.Context, t *ledger.BridgeTransfer, cause error) {
	sourceClient, ok := s.router.For(t.SourceChain)
	if !ok {
		s.settleFailed(ctx, t, StageMintChain, fmt.Errorf("cannot compensate: unknown source_chain %q", t.SourceChain))
		return
	}

	// Back to the source address, not the destination one: the point is to
	// restore the holder whose tokens were burned.
	compensationID := t.CorrelationID + "-compensation"
	txHash, err := sourceClient.BridgeMint(t.SourceAddress, t.Amount, compensationID)
	if err != nil && Classify(err) != ClassAlreadyProcessed {
		s.logger.Error("compensation mint failed; needs manual intervention",
			slog.String("correlation_id", t.CorrelationID), slog.Any("error", err))
		s.settleFailed(ctx, t, StageMintChain, fmt.Errorf("compensating %v: %w", cause, err))
		return
	}

	if _, err := s.ledger.BridgeCompensate(ctx, t.SourceWalletID, t.Amount, t.CorrelationID, txHash); err != nil {
		s.logger.Error("re-minted on the source chain but the ledger compensation failed; needs manual intervention",
			slog.String("correlation_id", t.CorrelationID), slog.Any("error", err))
		_ = s.repo.DeadLetter(ctx, t, StageMintChain, err.Error())
		return
	}

	if err := s.repo.SettleTransfer(ctx, t.CorrelationID, ledger.StatusCompensated, cause.Error()); err != nil {
		s.logger.Error("could not mark saga compensated",
			slog.String("correlation_id", t.CorrelationID), slog.Any("error", err))
	}
}

// Abandon is what the worker calls when the attempt budget is spent.
//
// It moves no money, deliberately. A budget is exhausted by transient
// failures, which means the last thing anyone knows is that the chain would
// not answer — not that the call failed. Compensating on "we don't know" is
// how a mint that was merely slow gets un-minted. So the saga is parked for a
// human, with its status left exactly as honest as it was.
func (s *Saga) Abandon(ctx context.Context, correlationID, stage string, cause error) error {
	t, err := s.repo.FindByCorrelationID(correlationID)
	if err != nil {
		return err
	}
	s.logger.Error("saga exhausted its attempt budget; parked for an operator",
		slog.String("correlation_id", correlationID),
		slog.String("kind", string(t.Kind)),
		slog.String("status", string(t.Status)),
		slog.String("stage", stage),
		slog.Int("attempts", t.Attempts),
		slog.Any("error", cause))
	return s.repo.DeadLetter(ctx, t, stage, cause.Error())
}

func isPostingRejection(err error) bool {
	var pe *ledger.PostingError
	return errors.As(err, &pe)
}
