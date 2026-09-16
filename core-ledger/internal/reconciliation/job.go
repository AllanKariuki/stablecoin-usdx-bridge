package reconciliation

import (
	"log"
	"math/big"
	"time"

	"github.com/keshi/usdx-bridge/core-ledger/internal/ledger"
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
// the other").
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

	// TODO: fetch actual trust bank collateral balance and compare
	// circulating (adjusted for inFlightTotal) against it; alert on drift
	// beyond a small tolerance.
	log.Printf("reconciliation: circulating=%s in_flight=%s", circulating, inFlightTotal)
	return nil
}
