package policy

import (
	"math/big"
	"testing"
)

// A signer's value is in what it refuses. These are the refusals.

func usdx(units int64) *big.Int { return big.NewInt(units) }

func testPolicy() Policy {
	return Policy{
		Rules: []Rule{
			{
				Chain:               "ETHEREUM",
				Method:              MethodBridgeMint,
				MaxAmount:           usdx(100_000_000), // 100 USD-X
				AllowedCallers:      []string{"core-ledger-worker"},
				AllowedDestinations: []string{"0xAAA", "0xBBB"},
			},
			{
				Chain:          "ETHEREUM",
				Method:         MethodBridgeBurn,
				MaxAmount:      usdx(100_000_000),
				AllowedCallers: []string{"core-ledger-worker"},
			},
			{
				Chain:          "ETHEREUM",
				Method:         MethodPause,
				AllowedCallers: []string{"core-ledger"},
			},
			{
				Chain:          "ETHEREUM",
				Method:         MethodUnpause,
				AllowedCallers: []string{"core-ledger"},
			},
			{
				Chain:          "ETHEREUM",
				Method:         MethodBlacklist,
				AllowedCallers: []string{"core-ledger"},
			},
			{
				Chain:          "ETHEREUM",
				Method:         MethodUnblacklist,
				AllowedCallers: []string{"core-ledger"},
			},
			{
				Chain:          "SOLANA",
				Method:         MethodPause,
				AllowedCallers: []string{"core-ledger"},
			},
			{
				Chain:          "SOLANA",
				Method:         MethodUnpause,
				AllowedCallers: []string{"core-ledger"},
			},
		},
		DailyLimits: map[string]*big.Int{
			LimitKey("ETHEREUM", MethodBridgeMint): usdx(250_000_000),
		},
	}
}

func mint(over func(*Request)) Request {
	req := Request{
		Chain:         "ETHEREUM",
		Method:        MethodBridgeMint,
		Amount:        usdx(50_000_000),
		To:            "0xAAA",
		CorrelationID: "corr-1",
		Caller:        "core-ledger-worker",
	}
	if over != nil {
		over(&req)
	}
	return req
}

func TestAllowsARequestThatMatchesEveryConstraint(t *testing.T) {
	d := testPolicy().Evaluate(mint(nil), nil)
	if !d.Allowed {
		t.Fatalf("a compliant request was refused: %s", d.Reason)
	}
}

// The property that makes this a control rather than a key file with extra
// steps: a method nobody wrote a rule for is refused, not signed.
func TestDeniesAMethodWithNoRule(t *testing.T) {
	d := testPolicy().Evaluate(mint(func(r *Request) { r.Method = MethodSetRelayer }), nil)
	if d.Allowed {
		t.Fatal("a method with no policy rule was signed")
	}
	if d.Reason == "" {
		t.Fatal("a refusal must say why — an unexplained denial is an outage nobody can diagnose")
	}
}

func TestDeniesAChainWithNoRule(t *testing.T) {
	d := testPolicy().Evaluate(mint(func(r *Request) { r.Chain = "SOLANA" }), nil)
	if d.Allowed {
		t.Fatal("a chain with no policy rule was signed")
	}
}

func TestEnforcesThePerSignatureCeiling(t *testing.T) {
	d := testPolicy().Evaluate(mint(func(r *Request) { r.Amount = usdx(100_000_001) }), nil)
	if d.Allowed {
		t.Fatal("an amount over the ceiling was signed")
	}
}

func TestAllowsExactlyTheCeiling(t *testing.T) {
	// The boundary. A ceiling of 100 means 100 is allowed; making it exclusive
	// would silently move every configured limit down by one unit.
	d := testPolicy().Evaluate(mint(func(r *Request) { r.Amount = usdx(100_000_000) }), nil)
	if !d.Allowed {
		t.Fatalf("an amount exactly at the ceiling was refused: %s", d.Reason)
	}
}

// The control that matters most against a compromised caller: a forged but
// otherwise plausible request cannot direct money anywhere the attacker holds.
func TestEnforcesTheDestinationAllowlist(t *testing.T) {
	d := testPolicy().Evaluate(mint(func(r *Request) { r.To = "0xATTACKER" }), nil)
	if d.Allowed {
		t.Fatal("a mint to an address outside the allowlist was signed")
	}
}

func TestDestinationMatchingIgnoresAddressCasing(t *testing.T) {
	// An Ethereum address is the same address whether or not it is EIP-55
	// checksummed. An allowlist that missed a casing would refuse legitimate
	// mints, and the operator's fix would be to widen the allowlist.
	d := testPolicy().Evaluate(mint(func(r *Request) { r.To = "0xaaa" }), nil)
	if !d.Allowed {
		t.Fatalf("a correct address in different casing was refused: %s", d.Reason)
	}
}

func TestEnforcesTheCallerAllowlist(t *testing.T) {
	// core-ledger's worker signs mints. Nothing else should be able to, even
	// with a valid client certificate.
	d := testPolicy().Evaluate(mint(func(r *Request) { r.Caller = "bff" }), nil)
	if d.Allowed {
		t.Fatal("a caller outside the allowlist was permitted to mint")
	}
}

// The failure a per-signature ceiling cannot catch: a thousand signatures each
// individually under the limit.
func TestEnforcesTheDailyLimit(t *testing.T) {
	p := testPolicy()

	// 200 already signed today, 50 more is 250 — exactly the limit, allowed.
	if d := p.Evaluate(mint(nil), usdx(200_000_000)); !d.Allowed {
		t.Fatalf("a signature landing exactly on the daily limit was refused: %s", d.Reason)
	}

	// One unit more is over.
	if d := p.Evaluate(mint(nil), usdx(200_000_001)); d.Allowed {
		t.Fatal("a signature over the daily limit was signed")
	}
}

func TestDailyLimitTreatsNoHistoryAsZero(t *testing.T) {
	if d := testPolicy().Evaluate(mint(nil), nil); !d.Allowed {
		t.Fatalf("the first signature of the day was refused: %s", d.Reason)
	}
}

// A method that moves no value has no ceiling, and must not be refused for
// carrying no amount.
func TestAllowsAValuelessMethodWithNoAmount(t *testing.T) {
	d := testPolicy().Evaluate(Request{
		Chain:  "ETHEREUM",
		Method: MethodPause,
		Caller: "core-ledger",
	}, nil)
	if !d.Allowed {
		t.Fatalf("pause was refused: %s", d.Reason)
	}
}

func TestPauseIsRestrictedToCoreLedger(t *testing.T) {
	// Pausing halts every transfer on the chain. The worker that mints must
	// not be able to — and neither may the old direct-caller identity, since
	// H6 routes enforcement through core-ledger.
	for _, caller := range []string{"core-ledger-worker", "compliance", "bff"} {
		d := testPolicy().Evaluate(Request{
			Chain:  "ETHEREUM",
			Method: MethodPause,
			Caller: caller,
		}, nil)
		if d.Allowed {
			t.Fatalf("%q was permitted to pause the contract", caller)
		}
	}
}

// H6: the four enforcement methods are all core-ledger's, on both chains —
// and each is its own rule, so forgetting one refuses rather than signs.
func TestEnforcementMethodsAreAllCoreLedgerOnly(t *testing.T) {
	allowed := []struct {
		chain  string
		method Method
	}{
		{"ETHEREUM", MethodPause},
		{"ETHEREUM", MethodUnpause},
		{"ETHEREUM", MethodBlacklist},
		{"ETHEREUM", MethodUnblacklist},
		{"SOLANA", MethodPause},
		{"SOLANA", MethodUnpause},
	}
	for _, tc := range allowed {
		d := testPolicy().Evaluate(Request{Chain: tc.chain, Method: tc.method, Caller: "core-ledger"}, nil)
		if !d.Allowed {
			t.Fatalf("%s %s was refused for core-ledger: %s", tc.chain, tc.method, d.Reason)
		}
		d = testPolicy().Evaluate(Request{Chain: tc.chain, Method: tc.method, Caller: "compliance"}, nil)
		if d.Allowed {
			t.Fatalf("%s %s was signed for compliance, which no longer calls the signer directly", tc.chain, tc.method)
		}
	}
}

func TestBlacklistCarriesItsDestinationThroughPolicy(t *testing.T) {
	// The blacklist target is the request's destination, so a deployment that
	// wants an allowlist on who may be blacklisted gets the same control the
	// mint rules have.
	p := Policy{Rules: []Rule{{
		Chain:               "ETHEREUM",
		Method:              MethodBlacklist,
		AllowedCallers:      []string{"core-ledger"},
		AllowedDestinations: []string{"0xAAA"},
	}}}
	d := p.Evaluate(Request{Chain: "ETHEREUM", Method: MethodBlacklist, To: "0xAAA", Caller: "core-ledger"}, nil)
	if !d.Allowed {
		t.Fatalf("a blacklist on an allowlisted address was refused: %s", d.Reason)
	}
	d = p.Evaluate(Request{Chain: "ETHEREUM", Method: MethodBlacklist, To: "0xATTACKER", Caller: "core-ledger"}, nil)
	if d.Allowed {
		t.Fatal("a blacklist outside the destination allowlist was signed")
	}
}

// A rule with a ceiling and a request with no amount is a mismatch that must
// fail closed: signing it would bypass the ceiling entirely.
func TestDeniesAnAmountlessRequestAgainstACeilingRule(t *testing.T) {
	d := testPolicy().Evaluate(mint(func(r *Request) { r.Amount = nil }), nil)
	if d.Allowed {
		t.Fatal("a request with no amount was signed against a rule with an amount ceiling")
	}
}

// First match wins, so a narrower rule placed first must take precedence — the
// ordering an operator relies on when adding an exception.
func TestFirstMatchingRuleWins(t *testing.T) {
	p := Policy{Rules: []Rule{
		{Chain: "ETHEREUM", Method: MethodBridgeMint, MaxAmount: usdx(1)},
		{Method: MethodBridgeMint, MaxAmount: usdx(1_000_000_000)},
	}}
	if d := p.Evaluate(mint(nil), nil); d.Allowed {
		t.Fatal("the broader rule was applied ahead of the narrower one that precedes it")
	}
}

// An empty Chain on a rule is a wildcard, which is how a policy covers both
// chains without duplicating every entry.
func TestAnEmptyChainOnARuleMatchesAnyChain(t *testing.T) {
	p := Policy{Rules: []Rule{{Method: MethodBridgeBurn, MaxAmount: usdx(10)}}}
	d := p.Evaluate(Request{Chain: "SOLANA", Method: MethodBridgeBurn, Amount: usdx(5)}, nil)
	if !d.Allowed {
		t.Fatalf("a wildcard-chain rule did not match SOLANA: %s", d.Reason)
	}
}
