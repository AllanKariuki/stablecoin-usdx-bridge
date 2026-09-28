package reconciliation

import (
	"fmt"
	"math/big"
	"time"
)

// The three legs are pure functions over integers, deliberately.
//
// A production invariant nobody can write a test for is an invariant nobody
// has checked — so each one is a function that takes numbers and returns a
// verdict, asserted by a unit test here and by the nightly job that runs the
// same code against Sepolia and devnet. None of them touch a database, a
// chain or a clock.

// ---------------------------------------------------------------------------
// Leg A — ledger vs chains
// ---------------------------------------------------------------------------

// Leg A is the invariant that makes USD-X a stablecoin rather than a number in
// a database:
//
//	USDX.totalSupply() + SPL supply  ==  GL 1300 (issued) − GL 2300.BRIDGE (in transit)
//
// Every token that exists on a chain was issued by this ledger, and every
// token this ledger issued either exists on a chain or is provably in transit
// between two of them. A drift in either direction is a defect with a name:
// positive means supply exists that nothing here created, negative means the
// ledger believes in tokens no chain has.
type LegAResult struct {
	// OnChain is the summed supply the chains report.
	OnChain *big.Int
	// Expected is what the journal says should be on chain.
	Expected *big.Int
	// Drift is OnChain − Expected. Zero is the only healthy value.
	Drift *big.Int

	EthSupply *big.Int
	SolSupply *big.Int
	Issued    *big.Int
	InTransit *big.Int
}

func (r LegAResult) OK() bool { return r.Drift.Sign() == 0 }

func (r LegAResult) Detail() string {
	return fmt.Sprintf("on_chain=%s expected=%s drift=%s (issued=%s in_transit=%s eth=%s sol=%s)",
		r.OnChain, r.Expected, r.Drift, r.Issued, r.InTransit, r.EthSupply, r.SolSupply)
}

func CheckLegA(issued, inTransit, ethSupply, solSupply *big.Int) LegAResult {
	onChain := new(big.Int).Add(ethSupply, solSupply)
	expected := new(big.Int).Sub(issued, inTransit)
	return LegAResult{
		OnChain:   onChain,
		Expected:  expected,
		Drift:     new(big.Int).Sub(onChain, expected),
		EthSupply: ethSupply,
		SolSupply: solSupply,
		Issued:    issued,
		InTransit: inTransit,
	}
}

// ---------------------------------------------------------------------------
// Leg B — backing vs issuance
// ---------------------------------------------------------------------------

// Leg B is the 1:1 peg itself: every USD-X in circulation has exactly one
// dollar of reserve booked against it. Backing is held in USD (2 decimals) and
// issuance in USD-X (6), so the comparison happens after the caller has
// restated backing at USD-X scale — doing the subtraction at two different
// scales is a 10,000x error that would look like a catastrophic break on a
// perfectly healthy platform.
type LegBResult struct {
	Backing       *big.Int // in USD smallest units, for the human reading the alert
	BackingAsUSDX *big.Int
	Issued        *big.Int
	// Drift is BackingAsUSDX − Issued. Negative means USD-X exists that
	// nothing backs.
	Drift *big.Int
}

func (r LegBResult) OK() bool { return r.Drift.Sign() == 0 }

func (r LegBResult) Detail() string {
	return fmt.Sprintf("reserve_backing=%s (=%s USD-X) issued=%s drift=%s",
		r.Backing, r.BackingAsUSDX, r.Issued, r.Drift)
}

func CheckLegB(backing, backingAsUSDX, issued *big.Int) LegBResult {
	return LegBResult{
		Backing:       backing,
		BackingAsUSDX: backingAsUSDX,
		Issued:        issued,
		Drift:         new(big.Int).Sub(backingAsUSDX, issued),
	}
}

// ---------------------------------------------------------------------------
// Leg C — ledger vs custodian
// ---------------------------------------------------------------------------

// Leg C is an inequality, not an equality, and that asymmetry is the point.
// The spec invariant is Fiat Reserves >= Tokens in Circulation: a custodian
// holding more than the ledger expects is unminted headroom and fine; holding
// less means USD-X exists that nothing backs.
type LegCResult struct {
	BankBalance *big.Int
	LedgerCash  *big.Int
	// Drift is BankBalance − LedgerCash. Only a negative value is a break.
	Drift *big.Int
	AsOf  time.Time
}

func (r LegCResult) OK() bool { return r.Drift.Sign() >= 0 }

func (r LegCResult) Detail() string {
	return fmt.Sprintf("shortfall=%s bank_balance=%s (as_of=%s) ledger_cash=%s",
		new(big.Int).Neg(r.Drift), r.BankBalance, r.AsOf.Format(time.RFC3339), r.LedgerCash)
}

func CheckLegC(bankBalance, ledgerCash *big.Int, asOf time.Time) LegCResult {
	return LegCResult{
		BankBalance: bankBalance,
		LedgerCash:  ledgerCash,
		Drift:       new(big.Int).Sub(bankBalance, ledgerCash),
		AsOf:        asOf,
	}
}
