package reconciliation

import (
	"context"
	"errors"
	"log"
	"math/big"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
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

// RunForever re-proves, on an interval, that the three records of the same
// money agree.
//
// This used to be a two-way comparison — on-chain supply against a bank
// snapshot — with mid-saga transfers netted out by scanning workflow rows. It
// is now a three-way check against the journal, which is both stricter and
// more diagnostic: when it breaks, the leg that breaks tells you which system
// is wrong.
//
//	Leg A  ledger says issued  ==  on-chain supply + in transit
//	Leg B  reserve backing     ==  ledger says issued        (the 1:1 peg)
//	Leg C  custodian statement >=  ledger says is in the bank
//
// Leg A catches a chain event the ledger missed or invented. Leg B catches
// USD-X issued without fiat behind it. Leg C catches the ledger and the bank
// disagreeing about cash. A two-way check would have folded all three into one
// number and told you only that something, somewhere, was off.
func (j *Job) RunForever() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		if err := j.CheckOnce(context.Background()); err != nil {
			log.Printf("reconciliation: %v", err)
		}
	}
}

func (j *Job) CheckOnce(ctx context.Context) error {
	ethSupply, _, err := j.eth.TotalSupply()
	if err != nil {
		return err
	}
	solSupply, _, err := j.sol.TotalSupply()
	if err != nil {
		return err
	}
	onChain := new(big.Int).Add(ethSupply, solSupply)

	// What the journal says exists: the debit balance of USD-X in circulation.
	issued, err := j.repo.BalanceByGLCode(ctx, ledger.GLCirculation)
	if err != nil {
		return err
	}
	// What has left one chain and not yet arrived on another, or been issued
	// but not yet minted. Derived from the journal, not from a status scan.
	inTransit, err := j.repo.BalanceByGLCode(ctx, ledger.GLBridgeSuspense)
	if err != nil {
		return err
	}

	// ---- Leg A: ledger vs chains -----------------------------------------
	expectedOnChain := new(big.Int).Sub(issued, inTransit)
	if onChain.Cmp(expectedOnChain) != 0 {
		drift := new(big.Int).Sub(onChain, expectedOnChain)
		alert("LEG_A ledger/chain mismatch: on_chain=%s expected=%s drift=%s (issued=%s in_transit=%s eth=%s sol=%s)",
			onChain, expectedOnChain, drift, issued, inTransit, ethSupply, solSupply)
	}

	// ---- Leg B: backing vs issuance --------------------------------------
	backing, err := j.repo.BalanceByGLCode(ctx, ledger.GLReserveBacking(ledger.PegCurrency))
	if err != nil {
		return err
	}
	backingAsUSDX, err := j.pegScale(ctx, backing)
	if err != nil {
		return err
	}
	if backingAsUSDX.Cmp(issued) != 0 {
		alert("LEG_B peg broken: reserve_backing=%s (=%s USD-X) issued=%s",
			backing, backingAsUSDX, issued)
	}

	// ---- Leg C: ledger vs custodian --------------------------------------
	ledgerCash, err := j.repo.BalanceByGLCode(ctx, ledger.GLTrustBank(ledger.PegCurrency))
	if err != nil {
		return err
	}
	bankBalance, asOf, err := j.repo.LatestTrustBankBalance()
	if errors.Is(err, ledger.ErrNoTrustBankSnapshot) {
		log.Printf("reconciliation: issued=%s on_chain=%s in_transit=%s ledger_cash=%s (no trust bank snapshot yet, Leg C skipped)",
			issued, onChain, inTransit, ledgerCash)
		return nil
	}
	if err != nil {
		return err
	}

	// The spec invariant is Fiat Reserves >= Tokens in Circulation: the bank
	// holding more than the ledger expects is unminted headroom and fine;
	// holding less means USD-X exists that nothing backs.
	if bankBalance.Cmp(ledgerCash) < 0 {
		shortfall := new(big.Int).Sub(ledgerCash, bankBalance)
		alert("LEG_C custodian shortfall=%s bank_balance=%s (as_of=%s) ledger_cash=%s",
			shortfall, bankBalance, asOf.Format(time.RFC3339), ledgerCash)
	}

	log.Printf("reconciliation: OK issued=%s on_chain=%s in_transit=%s backing=%s ledger_cash=%s bank_balance=%s (as_of=%s)",
		issued, onChain, inTransit, backing, ledgerCash, bankBalance, asOf.Format(time.RFC3339))
	return nil
}

// pegScale restates a USD amount in USD-X's smallest units at the 1:1 peg —
// the two differ only by decimal scale (2 vs 6), which is exactly what
// ledger.Convert exists to handle.
func (j *Job) pegScale(ctx context.Context, usd *big.Int) (*big.Int, error) {
	from, err := j.repo.Currency(ctx, ledger.PegCurrency)
	if err != nil {
		return nil, err
	}
	to, err := j.repo.Currency(ctx, ledger.USDXCode)
	if err != nil {
		return nil, err
	}
	return ledger.Convert(ledger.PegQuote(from.Code, to.Code), usd, *from, *to).Gross, nil
}

// alert is the placeholder for the real paging channel (PagerDuty/Slack). Every
// call here is a break in an invariant that should never break on its own.
func alert(format string, args ...any) {
	log.Printf("reconciliation: ALERT "+format, args...)
}
