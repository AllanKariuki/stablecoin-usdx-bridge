// Package policy is the reason a signer service is worth more than a
// well-guarded key file.
//
// A key in Vault that signs whatever it is handed has moved the key, not the
// risk: an attacker who can reach the service can still mint arbitrarily. The
// value is in what the service *refuses* — and the refusals have to be
// expressible against the thing being signed, which is why the Signer seam
// built in P2 passes whole transactions rather than opaque digests. A policy
// cannot check an amount ceiling against 32 bytes of hash.
//
// Everything here is pure functions over a decoded request. No database, no
// clock beyond what the caller passes, no network — because a policy engine
// that can only be tested by standing up a service is a policy engine whose
// edge cases are untested, and its edge cases are the whole point.
package policy

import (
	"fmt"
	"math/big"
	"strings"
)

// Method is what is being asked for, in the vocabulary the chain clients use.
type Method string

const (
	MethodBridgeMint Method = "bridgeMint"
	MethodBridgeBurn Method = "bridgeBurn"
	MethodBlacklist  Method = "blacklist"
	MethodPause      Method = "pause"
	MethodSetRelayer Method = "setRelayer"
	MethodTransfer   Method = "transfer"
)

// Request is a decoded signing request: what chain, what method, how much, to
// whom.
type Request struct {
	Chain  string
	Method Method
	// Amount in the asset's smallest units. Nil for methods that move no
	// value (pause, blacklist).
	Amount *big.Int
	// To is the destination the method acts on: a mint recipient, a burn
	// source, a blacklist target.
	To string
	// CorrelationID ties the request to a saga, and is what makes signing
	// idempotent — a retried mint must return the *original* signature, not a
	// second valid one for the same money.
	CorrelationID string
	// Caller is the authenticated client identity from the mTLS certificate.
	Caller string
}

// Rule is one policy entry. A request must match a rule to be signed; an
// unmatched request is refused, because a signer that defaults to yes is a
// key file with extra steps.
type Rule struct {
	// Chain and Method the rule governs. Empty Chain matches any.
	Chain  string
	Method Method

	// MaxAmount is the ceiling for a single signature, in smallest units. Nil
	// means no ceiling, which is only appropriate for methods that move no
	// value.
	MaxAmount *big.Int

	// AllowedDestinations, when non-empty, is an allowlist. It is the control
	// that matters most for a compromised caller: an attacker who can reach
	// the signer and forge a plausible request still cannot direct the money
	// anywhere they control.
	AllowedDestinations []string

	// AllowedCallers, when non-empty, restricts which mTLS client identities
	// may use this rule. core-ledger's worker signs mints; nothing else
	// should be able to.
	AllowedCallers []string
}

// Policy is an ordered rule set. First match wins, so a narrower rule must
// precede a broader one.
type Policy struct {
	Rules []Rule

	// DailyLimits caps the total signed per (chain, method) per day, checked
	// against a tally the caller supplies. It is the backstop for the failure
	// the per-signature ceiling cannot catch: a thousand signatures each
	// individually under the limit.
	DailyLimits map[string]*big.Int
}

// Decision is why a request was allowed or refused. The reason travels to the
// audit log and to the caller, because "policy denied" with no explanation
// turns a correct refusal into an outage nobody can diagnose.
type Decision struct {
	Allowed bool
	Reason  string
	Rule    *Rule
}

func allow(rule *Rule) Decision {
	return Decision{Allowed: true, Rule: rule, Reason: "matched policy"}
}

func deny(format string, args ...any) Decision {
	return Decision{Allowed: false, Reason: fmt.Sprintf(format, args...)}
}

// Evaluate decides one request. dailyTotal is what has already been signed
// today for this (chain, method), which the caller reads from the audit log —
// keeping it a parameter is what lets the limit be tested without a database.
func (p Policy) Evaluate(req Request, dailyTotal *big.Int) Decision {
	rule := p.match(req)
	if rule == nil {
		// Default deny. A signer with no rule for a method must refuse it,
		// not sign it: forgetting to write a rule should not be the same as
		// deciding the method is unrestricted.
		return deny("no policy rule matches %s/%s for caller %q", req.Chain, req.Method, req.Caller)
	}

	if len(rule.AllowedCallers) > 0 && !contains(rule.AllowedCallers, req.Caller) {
		return deny("caller %q is not permitted to request %s/%s", req.Caller, req.Chain, req.Method)
	}

	if rule.MaxAmount != nil {
		if req.Amount == nil {
			return deny("%s/%s has an amount ceiling but the request carries no amount", req.Chain, req.Method)
		}
		if req.Amount.Cmp(rule.MaxAmount) > 0 {
			return deny("amount %s exceeds the per-signature ceiling of %s for %s/%s",
				req.Amount, rule.MaxAmount, req.Chain, req.Method)
		}
	}

	if len(rule.AllowedDestinations) > 0 && !containsFold(rule.AllowedDestinations, req.To) {
		// The control that matters most against a compromised caller: a
		// forged but plausible request still cannot direct money anywhere the
		// attacker holds.
		return deny("destination %q is not on the allowlist for %s/%s", req.To, req.Chain, req.Method)
	}

	if limit, ok := p.DailyLimits[limitKey(req.Chain, req.Method)]; ok && limit != nil && req.Amount != nil {
		if dailyTotal == nil {
			dailyTotal = new(big.Int)
		}
		projected := new(big.Int).Add(dailyTotal, req.Amount)
		if projected.Cmp(limit) > 0 {
			// The failure a per-signature ceiling cannot catch: a thousand
			// signatures each individually under the limit.
			return deny("this signature would take today's %s/%s total to %s, over the daily limit of %s",
				req.Chain, req.Method, projected, limit)
		}
	}

	return allow(rule)
}

func (p Policy) match(req Request) *Rule {
	for i := range p.Rules {
		rule := &p.Rules[i]
		if rule.Method != req.Method {
			continue
		}
		if rule.Chain != "" && !strings.EqualFold(rule.Chain, req.Chain) {
			continue
		}
		return rule
	}
	return nil
}

// LimitKey is the tally key the caller aggregates its audit log by.
func LimitKey(chain string, method Method) string { return limitKey(chain, method) }

func limitKey(chain string, method Method) string {
	return strings.ToUpper(chain) + ":" + string(method)
}

func contains(haystack []string, needle string) bool {
	for _, v := range haystack {
		if v == needle {
			return true
		}
	}
	return false
}

// containsFold compares case-insensitively, because an Ethereum address is
// the same address whether or not it is EIP-55 checksummed, and an allowlist
// that missed one casing would refuse a legitimate mint.
func containsFold(haystack []string, needle string) bool {
	for _, v := range haystack {
		if strings.EqualFold(v, needle) {
			return true
		}
	}
	return false
}
