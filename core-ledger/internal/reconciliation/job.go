package reconciliation

import (
	"errors"
	"log"
	"math/big"
	"time"

	"core-ledger/internal/ledger"
)

type SupplySource interface {
	TotalSupply() (*big.Int, uint64, error)
}

type Job struct {
	repo *ledger.Repository
	eth  SupplySource
	sol  SupplySource
}

func NewJob(repo *ledger.Repository, eth, sol SupplySource) *Job {
	return &Job{repo: repo, eth: eth, sol: sol}
}

// RunForever checks, on an interval, that circulating supply across both
// chains matches trust bank collateral — net of transfers that are
// legitimately mid-saga (briefly "burned on one chain, not yet minted on
// the other", or fiat already deposited but not yet minted at all).
func (j *Job) RunForever() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		if err := j.checkOnce(); err != nil {
			log.Printf("reconciliation: %v", err)
		}
	}
}

func (j *Job) checkOnce() error {
	ethSupply, _, err := j.eth.TotalSupply()
	if err != nil {
		return err
	}
	solSupply, _, err := j.sol.TotalSupply()
	if err != nil {
		return err
	}

	circulating := new(big.Int).Add(ethSupply, solSupply)

	inFlight, err := j.repo.InFlight()
	if err != nil {
		return err
	}
	inFlightTotal := big.NewInt(0)
	for _, t := range inFlight {
		inFlightTotal.Add(inFlightTotal, t.Amount)
	}

	// What total on-chain supply should reach once every in-flight transfer
	// settles: a burn-then-mint transiently shows less supply than it should
	// (burned already, not minted yet); a fresh mint transiently shows less
	// supply than the fiat already deposited for it.
	expectedBacked := new(big.Int).Add(circulating, inFlightTotal)

	bankBalance, asOf, err := j.repo.LatestTrustBankBalance()
	if errors.Is(err, ledger.ErrNoTrustBankSnapshot) {
		log.Printf(
			"reconciliation: circulating=%s in_flight=%s (no trust bank snapshot recorded yet, skipping comparison)",
			circulating, inFlightTotal,
		)
		return nil
	}
	if err != nil {
		return err
	}

	// Spec invariant: Fiat Reserves >= Tokens in Circulation. The bank
	// holding more than expected is fine (unminted headroom); less is not.
	if bankBalance.Cmp(expectedBacked) < 0 {
		shortfall := new(big.Int).Sub(expectedBacked, bankBalance)
		// A real deployment should page someone here (PagerDuty/Slack) —
		// logging is a placeholder for that alert channel.
		log.Printf(
			"reconciliation: ALERT shortfall=%s bank_balance=%s (as_of=%s) expected_backed=%s circulating=%s in_flight=%s",
			shortfall, bankBalance, asOf.Format(time.RFC3339), expectedBacked, circulating, inFlightTotal,
		)
		return nil
	}

	log.Printf(
		"reconciliation: OK bank_balance=%s (as_of=%s) expected_backed=%s circulating=%s in_flight=%s",
		bankBalance, asOf.Format(time.RFC3339), expectedBacked, circulating, inFlightTotal,
	)
	return nil
}
