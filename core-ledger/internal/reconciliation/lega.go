package reconciliation

import "math/big"

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
//
// It is extracted as a pure function so it can be asserted rather than only
// alerted on — by a unit test over the arithmetic, and by the nightly job that
// runs it against Sepolia and devnet. A production invariant nobody can write
// a test for is an invariant nobody has checked.

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
