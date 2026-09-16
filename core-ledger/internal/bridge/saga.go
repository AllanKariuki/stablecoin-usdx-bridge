package bridge

import (
	"fmt"
	"log"

	"github.com/usdx-bridge/core-ledger/internal/ledger"
)

type Saga struct {
	repo   *ledger.Repository
	router *Router
}

func NewSaga(repo *ledger.Repository, router *Router) *Saga {
	return &Saga{repo: repo, router: router}
}

// Execute runs the burn-then-mint saga for a transfer already persisted as
// PENDING. It's safe to call again after a crash: each step checks the
// transfer's current status before acting, so a resumed run picks up where
// it left off instead of repeating a completed step.
func (s *Saga) Execute(correlationID string) {
	t, err := s.repo.FindByCorrelationID(correlationID)
	if err != nil {
		log.Printf("saga: cannot load transfer %s: %v", correlationID, err)
		return
	}

	sourceClient, ok := s.router.For(t.SourceChain)
	if !ok {
		s.fail(t.CorrelationID, fmt.Errorf("unknown source_chain %q", t.SourceChain))
		return
	}
	targetClient, ok := s.router.For(t.TargetChain) // target_chain drives destination routing
	if !ok {
		s.fail(t.CorrelationID, fmt.Errorf("unknown target_chain %q", t.TargetChain))
		return
	}

	if t.Status == ledger.StatusPending {
		txHash, err := sourceClient.BridgeBurn(t.UserAddress, t.Amount, t.CorrelationID)
		if err != nil {
			s.fail(t.CorrelationID, err)
			return
		}
		if err := sourceClient.WaitForFinality(txHash, "finalized"); err != nil {
			s.fail(t.CorrelationID, err)
			return
		}
		s.repo.UpdateStatus(t.CorrelationID, ledger.StatusBurnConfirmed)
	}

	// Re-fetch in case status changed above, then proceed to mint.
	txHash, err := targetClient.BridgeMint(t.UserAddress, t.Amount, t.CorrelationID)
	if err != nil {
		s.compensate(t, sourceClient, err)
		return
	}
	s.repo.UpdateStatus(t.CorrelationID, ledger.StatusMintSubmitted)

	if err := targetClient.WaitForFinality(txHash, "finalized"); err != nil {
		s.compensate(t, sourceClient, err)
		return
	}
	s.repo.UpdateStatus(t.CorrelationID, ledger.StatusCompleted)
}

func (s *Saga) fail(correlationID string, err error) {
	log.Printf("saga %s failed before burn confirmed: %v", correlationID, err)
	s.repo.UpdateStatus(correlationID, ledger.StatusFailed)
}

// compensate handles the case where the source burn succeeded but the
// destination mint didn't: re-mint on the source chain under a fresh
// correlation id so the user isn't left with funds burned nowhere.
func (s *Saga) compensate(t *ledger.BridgeTransfer, sourceClient ChainClient, mintErr error) {
	log.Printf("saga %s: mint failed after burn confirmed, compensating: %v", t.CorrelationID, mintErr)
	compensationID := t.CorrelationID + "-compensation"
	if _, err := sourceClient.BridgeMint(t.UserAddress, t.Amount, compensationID); err != nil {
		log.Printf("saga %s: COMPENSATION FAILED, needs manual intervention: %v", t.CorrelationID, err)
		s.repo.UpdateStatus(t.CorrelationID, ledger.StatusFailed)
		return
	}
	s.repo.UpdateStatus(t.CorrelationID, ledger.StatusCompensated)
}
