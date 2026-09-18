package bridge

import (
	"context"
	"fmt"
	"log"

	"core-ledger/internal/ledger"
)

type Saga struct {
	repo   *ledger.Repository
	ledger *ledger.Service
	router *Router
}

func NewSaga(repo *ledger.Repository, svc *ledger.Service, router *Router) *Saga {
	return &Saga{repo: repo, ledger: svc, router: router}
}

// Execute runs the saga for a transfer already persisted as PENDING. It's safe
// to call again after a crash: each step checks the transfer's current status
// before acting, and every ledger posting carries a correlation-derived
// idempotency key, so a resumed run re-posts nothing.
//
// Two shapes run through here:
//
//   - A fresh mint (no source chain). The fiat side was already journalled by
//     ledger.Service.Issue before this saga started; the USD-X sits in the
//     in-transit suspense account. All that remains is to mint on chain and
//     release it into the user's wallet.
//
//   - A cross-chain bridge. The user's USD-X moves wallet -> suspense -> wallet
//     in the journal, mirroring burn -> in flight -> mint on the chains. The
//     ledger leg always precedes the chain leg it represents, so a crash
//     between them leaves value visibly parked in suspense rather than
//     silently doubled or lost.
func (s *Saga) Execute(correlationID string) {
	ctx := context.Background()

	t, err := s.repo.FindByCorrelationID(correlationID)
	if err != nil {
		log.Printf("saga: cannot load transfer %s: %v", correlationID, err)
		return
	}

	targetClient, ok := s.router.For(t.TargetChain) // target_chain drives destination routing
	if !ok {
		s.fail(ctx, t, fmt.Errorf("unknown target_chain %q", t.TargetChain))
		return
	}

	// A fresh mint (no source_chain) is a straight issuance against trust-bank
	// collateral, backing RMS has already verified — there's nothing to burn.
	isBridgeTransfer := t.SourceChain != ""

	var sourceClient ChainClient
	if isBridgeTransfer {
		sourceClient, ok = s.router.For(t.SourceChain)
		if !ok {
			s.fail(ctx, t, fmt.Errorf("unknown source_chain %q", t.SourceChain))
			return
		}
	}

	if isBridgeTransfer && t.Status == ledger.StatusPending {
		// Journal first: debiting the source wallet into suspense is what
		// reserves the funds. Burning on chain before the ledger says the user
		// can afford it would let two concurrent bridges spend one balance.
		if _, err := s.ledger.BridgeOut(ctx, t.SourceWalletID, t.Amount, t.CorrelationID, ""); err != nil {
			log.Printf("saga %s: ledger rejected the burn leg: %v", t.CorrelationID, err)
			s.repo.UpdateStatus(t.CorrelationID, ledger.StatusFailed)
			return
		}

		txHash, err := sourceClient.BridgeBurn(t.UserAddress, t.Amount, t.CorrelationID)
		if err != nil {
			s.unwindBurnLeg(ctx, t, err)
			return
		}
		if err := sourceClient.WaitForFinality(txHash, "finalized"); err != nil {
			s.unwindBurnLeg(ctx, t, err)
			return
		}
		s.repo.UpdateStatus(t.CorrelationID, ledger.StatusBurnConfirmed)
	}

	txHash, err := targetClient.BridgeMint(t.UserAddress, t.Amount, t.CorrelationID)
	if err != nil {
		s.mintFailed(ctx, t, sourceClient, err)
		return
	}
	s.repo.UpdateStatus(t.CorrelationID, ledger.StatusMintSubmitted)

	if err := targetClient.WaitForFinality(txHash, "finalized"); err != nil {
		s.mintFailed(ctx, t, sourceClient, err)
		return
	}

	// The tokens now exist on the destination chain, so the journal can release
	// them from suspense into the user's wallet. Both paths post the same
	// movement; they differ only in which transaction type the audit trail
	// should show.
	if isBridgeTransfer {
		_, err = s.ledger.BridgeIn(ctx, t.TargetWalletID, t.Amount, t.CorrelationID, txHash)
	} else {
		_, err = s.ledger.ConfirmUSDXCredit(ctx, t.TargetWalletID, t.Amount, t.CorrelationID, txHash)
	}
	if err != nil {
		// The chain is ahead of the ledger: tokens are minted but the journal
		// still parks them in suspense. Reconciliation will see the suspense
		// balance and the on-chain supply disagree, which is precisely the
		// condition a human should be woken for — so leave the status honest
		// rather than marking it complete.
		log.Printf("saga %s: MINTED ON CHAIN BUT LEDGER CREDIT FAILED, needs manual intervention: %v", t.CorrelationID, err)
		return
	}

	s.repo.UpdateStatus(t.CorrelationID, ledger.StatusCompleted)
}

func (s *Saga) fail(ctx context.Context, t *ledger.BridgeTransfer, err error) {
	log.Printf("saga %s failed before any chain call: %v", t.CorrelationID, err)
	s.reverseIssuance(ctx, t)
	s.repo.UpdateStatus(t.CorrelationID, ledger.StatusFailed)
}

// unwindBurnLeg backs out the ledger reservation when the on-chain burn never
// landed. Nothing was destroyed on chain, so the user's USD-X goes straight
// back to their source wallet by reversing the leg that parked it.
func (s *Saga) unwindBurnLeg(ctx context.Context, t *ledger.BridgeTransfer, cause error) {
	log.Printf("saga %s: source burn failed, releasing the ledger reservation: %v", t.CorrelationID, cause)

	txs, err := s.repo.TransactionsForEntity(ctx, ledger.EntityBridgeTransfer, t.CorrelationID)
	if err == nil {
		for _, tx := range txs {
			if tx.Type == ledger.TxChainBridgeOut && !tx.Reversed {
				if _, rerr := s.repo.Reverse(ctx, tx.ID, "source burn failed", "bridge-saga", ""); rerr != nil {
					log.Printf("saga %s: COULD NOT REVERSE THE BURN LEG, funds are stuck in suspense: %v", t.CorrelationID, rerr)
				}
			}
		}
	} else {
		log.Printf("saga %s: could not load ledger transactions to unwind: %v", t.CorrelationID, err)
	}

	s.repo.UpdateStatus(t.CorrelationID, ledger.StatusFailed)
}

// mintFailed handles a failed mint leg. For a fresh mint (no burn happened,
// sourceClient is nil) there is nothing to compensate on chain — the issuance
// itself is reversed, returning the user's fiat. For a bridge transfer the
// source burn already succeeded, so it must be undone on chain and in the
// journal.
func (s *Saga) mintFailed(ctx context.Context, t *ledger.BridgeTransfer, sourceClient ChainClient, mintErr error) {
	if sourceClient == nil {
		log.Printf("saga %s: mint failed: %v", t.CorrelationID, mintErr)
		s.reverseIssuance(ctx, t)
		s.repo.UpdateStatus(t.CorrelationID, ledger.StatusFailed)
		return
	}
	s.compensate(ctx, t, sourceClient, mintErr)
}

// reverseIssuance gives a user their fiat back when USD-X that was issued
// against it could never be minted. It is a reversal rather than a fresh
// transaction because nothing economically happened: the issuance was a
// bookkeeping event that turned out not to be true.
func (s *Saga) reverseIssuance(ctx context.Context, t *ledger.BridgeTransfer) {
	txs, err := s.repo.TransactionsForEntity(ctx, ledger.EntityBridgeTransfer, t.CorrelationID)
	if err != nil {
		log.Printf("saga %s: could not load issuance to reverse: %v", t.CorrelationID, err)
		return
	}
	for _, tx := range txs {
		if tx.Type == ledger.TxUSDXIssue && !tx.Reversed {
			if _, rerr := s.repo.Reverse(ctx, tx.ID, "mint failed, issuance reversed", "bridge-saga", ""); rerr != nil {
				log.Printf("saga %s: COULD NOT REVERSE ISSUANCE, user's fiat is stranded: %v", t.CorrelationID, rerr)
			}
		}
	}
}

// compensate handles the case where the source burn succeeded but the
// destination mint didn't: re-mint on the source chain under a fresh
// correlation id so the user isn't left with funds burned nowhere, then move
// the journal's in-transit balance back to the source wallet.
func (s *Saga) compensate(ctx context.Context, t *ledger.BridgeTransfer, sourceClient ChainClient, mintErr error) {
	log.Printf("saga %s: mint failed after burn confirmed, compensating: %v", t.CorrelationID, mintErr)

	compensationID := t.CorrelationID + "-compensation"
	txHash, err := sourceClient.BridgeMint(t.UserAddress, t.Amount, compensationID)
	if err != nil {
		log.Printf("saga %s: COMPENSATION FAILED, needs manual intervention: %v", t.CorrelationID, err)
		s.repo.UpdateStatus(t.CorrelationID, ledger.StatusFailed)
		return
	}

	if _, err := s.ledger.BridgeCompensate(ctx, t.SourceWalletID, t.Amount, t.CorrelationID, txHash); err != nil {
		log.Printf("saga %s: re-minted on source but LEDGER COMPENSATION FAILED, needs manual intervention: %v", t.CorrelationID, err)
		return
	}

	s.repo.UpdateStatus(t.CorrelationID, ledger.StatusCompensated)
}
