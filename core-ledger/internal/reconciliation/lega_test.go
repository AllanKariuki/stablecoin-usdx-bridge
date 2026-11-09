package reconciliation

import (
	"math/big"
	"testing"
)

func n(s string) *big.Int {
	v, ok := new(big.Int).SetString(s, 10)
	if !ok {
		panic("bad test number " + s)
	}
	return v
}

// Each case here is a state the platform can genuinely be in, named by what it
// means rather than by its arithmetic — Leg A's value is that the sign of the
// drift tells you which system is wrong.
func TestCheckLegA(t *testing.T) {
	cases := []struct {
		name      string
		issued    string
		inTransit string
		eth       string
		sol       string
		drift     string
		healthy   bool
	}{
		{
			name:   "nothing issued yet",
			issued: "0", inTransit: "0", eth: "0", sol: "0",
			drift: "0", healthy: true,
		},
		{
			// The steady state: everything issued has been minted.
			name:   "all issued supply is on chain",
			issued: "250000000", inTransit: "0", eth: "250000000", sol: "0",
			drift: "0", healthy: true,
		},
		{
			// Mid-issuance. The USD-X is journalled but the mint hasn't landed,
			// which is exactly what the suspense account is for — and the
			// reason a two-way chain-vs-bank check would have flagged this
			// healthy state as a break.
			name:   "an issuance awaiting its mint is not a drift",
			issued: "250000000", inTransit: "100000000", eth: "150000000", sol: "0",
			drift: "0", healthy: true,
		},
		{
			name:   "a bridge in flight across both chains is not a drift",
			issued: "500000000", inTransit: "75000000", eth: "300000000", sol: "125000000",
			drift: "0", healthy: true,
		},
		{
			// Supply nothing here created: a mint that bypassed the ledger, or
			// a compromised BRIDGE_ROLE. The most serious reading of a break.
			name:   "unbacked supply on chain",
			issued: "250000000", inTransit: "0", eth: "260000000", sol: "0",
			drift: "10000000", healthy: false,
		},
		{
			// The ledger believes in tokens no chain has: a burn the ledger
			// missed, or a mint it recorded that never landed.
			name:   "ledger believes in tokens that do not exist",
			issued: "250000000", inTransit: "0", eth: "240000000", sol: "0",
			drift: "-10000000", healthy: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := CheckLegA(n(tc.issued), n(tc.inTransit), n(tc.eth), n(tc.sol))
			if got.Drift.String() != tc.drift {
				t.Fatalf("drift = %s, want %s", got.Drift, tc.drift)
			}
			if got.OK() != tc.healthy {
				t.Fatalf("OK() = %v, want %v (drift %s)", got.OK(), tc.healthy, got.Drift)
			}
		})
	}
}

// The inputs are read from the journal and the chains, and a function that
// mutated them would corrupt the caller's view of both.
func TestCheckLegADoesNotMutateItsInputs(t *testing.T) {
	issued, inTransit := n("250000000"), n("100000000")
	eth, sol := n("150000000"), n("0")

	CheckLegA(issued, inTransit, eth, sol)

	for name, got := range map[string]struct{ have, want *big.Int }{
		"issued":     {issued, n("250000000")},
		"in transit": {inTransit, n("100000000")},
		"eth supply": {eth, n("150000000")},
		"sol supply": {sol, n("0")},
	} {
		if got.have.Cmp(got.want) != 0 {
			t.Fatalf("%s was mutated: %s, want %s", name, got.have, got.want)
		}
	}
}
