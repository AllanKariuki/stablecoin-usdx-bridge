package reconciliation

import (
	"math/big"
	"testing"
	"time"
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

// ---------------------------------------------------------------------------
// Leg B — the peg itself
// ---------------------------------------------------------------------------

func TestCheckLegB(t *testing.T) {
	cases := []struct {
		name          string
		backing       string // USD smallest units, for the message only
		backingAsUSDX string
		issued        string
		drift         string
		healthy       bool
	}{
		{
			name:    "nothing issued, nothing backing it",
			backing: "0", backingAsUSDX: "0", issued: "0",
			drift: "0", healthy: true,
		},
		{
			// $250.00 backing 250 USD-X. The two are held at different scales
			// (2 vs 6 decimals) and the caller restates one before comparing —
			// doing the subtraction unscaled is a 10,000x error that would
			// report a catastrophic break on a perfectly healthy platform.
			name:    "the peg holds at 1:1 across two decimal scales",
			backing: "25000", backingAsUSDX: "250000000", issued: "250000000",
			drift: "0", healthy: true,
		},
		{
			// The condition that must never be true: USD-X exists that nothing
			// backs. This is the severity-critical break.
			name:    "USD-X issued with no reserve behind it",
			backing: "20000", backingAsUSDX: "200000000", issued: "250000000",
			drift: "-50000000", healthy: false,
		},
		{
			// Over-backing is still a break, deliberately. Leg C tolerates a
			// custodian holding extra (it is unminted headroom); the *reserve
			// backing account* holding more than was issued means a journal
			// entry went somewhere it shouldn't have.
			name:    "more backing booked than USD-X issued",
			backing: "30000", backingAsUSDX: "300000000", issued: "250000000",
			drift: "50000000", healthy: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := CheckLegB(n(tc.backing), n(tc.backingAsUSDX), n(tc.issued))
			if got.Drift.Cmp(n(tc.drift)) != 0 {
				t.Errorf("drift = %s, want %s", got.Drift, tc.drift)
			}
			if got.OK() != tc.healthy {
				t.Errorf("OK() = %v, want %v (%s)", got.OK(), tc.healthy, got.Detail())
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Leg C — the inequality
// ---------------------------------------------------------------------------

func TestCheckLegC(t *testing.T) {
	asOf := time.Date(2026, 9, 28, 9, 0, 0, 0, time.UTC)

	cases := []struct {
		name        string
		bankBalance string
		ledgerCash  string
		drift       string
		healthy     bool
	}{
		{
			name:        "the bank and the ledger agree exactly",
			bankBalance: "100000", ledgerCash: "100000",
			drift: "0", healthy: true,
		},
		{
			// The asymmetry is the point. The spec invariant is
			// Fiat Reserves >= Tokens in Circulation, so a custodian holding
			// more than the ledger expects is unminted headroom, not a break.
			// An equality check here would page the on-call every time a wire
			// landed before its deposit was booked.
			name:        "the bank holds more than the ledger expects",
			bankBalance: "150000", ledgerCash: "100000",
			drift: "50000", healthy: true,
		},
		{
			// The DoD's demo case: a custodian snapshot $1,000 short.
			name:        "custodian shortfall",
			bankBalance: "99000", ledgerCash: "100000",
			drift: "-1000", healthy: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := CheckLegC(n(tc.bankBalance), n(tc.ledgerCash), asOf)
			if got.Drift.Cmp(n(tc.drift)) != 0 {
				t.Errorf("drift = %s, want %s", got.Drift, tc.drift)
			}
			if got.OK() != tc.healthy {
				t.Errorf("OK() = %v, want %v (%s)", got.OK(), tc.healthy, got.Detail())
			}
		})
	}
}

// severityFor ranks the legs for the alert payload. Leg B is the only critical
// one: a broken peg means USD-X exists against nothing, which is a
// stop-the-platform condition rather than a look-into-it one.
func TestSeverityRanksABrokenPegAsCritical(t *testing.T) {
	if got := severityFor(LegBName); got != "critical" {
		t.Errorf("Leg B severity = %q, want critical", got)
	}
	for _, leg := range []string{LegAName, LegCName} {
		if got := severityFor(leg); got != "high" {
			t.Errorf("%s severity = %q, want high", leg, got)
		}
	}
}
