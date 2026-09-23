// Package authztable maps an inbound request (method + path) to the set of
// permissions that authorize it, using shared/authz's generated role→
// permission expansion as the source of truth for what each permission
// means.
//
// A route rule lists every permission that's *sufficient* on its own — not
// every permission required — because the gateway can't see resource
// ownership (whether wallet :walletId belongs to the caller). It only knows
// "does this caller hold wallets:read:own or wallets:read:any". The actual
// own-vs-any enforcement happens downstream, in the service that can see
// the resource (core-ledger/BFF), using the X-User-Id this proxy sets.
package authztable

import (
	"regexp"
	"strings"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/authz/generated"
)

// Rule is one route→permission mapping. Path uses Fiber-style :param
// segments, translated to a regexp at build time.
type Rule struct {
	Method     string
	Path       string
	AnyOf      []authz.Permission
	pathRegexp *regexp.Regexp
}

// Table is an ordered list of rules, matched first-to-last so a more
// specific rule can precede a catch-all.
type Table []*Rule

var paramSegment = regexp.MustCompile(`:[^/]+`)

// compile turns a Fiber-style path ("/wallets/:walletId") into a regexp
// matching any value in the :param position. Path segments here are fixed,
// developer-authored strings (not user input), so building the regexp by
// substitution before quoting — rather than quoting first, which would also
// escape the ':' this substitution looks for — is safe.
func compile(method, path string, anyOf ...authz.Permission) *Rule {
	return &Rule{
		Method:     method,
		Path:       path,
		AnyOf:      anyOf,
		pathRegexp: regexp.MustCompile("^" + paramSegment.ReplaceAllString(path, `[^/]+`) + "$"),
	}
}

// Match returns the rule authorizing method+path, and whether one was
// found. A path with no matching rule is denied by default — see
// DefaultDeny in the handler package.
func (t Table) Match(method, path string) (*Rule, bool) {
	method = strings.ToUpper(method)
	for _, r := range t {
		if r.Method != method {
			continue
		}
		if r.pathRegexp.MatchString(path) {
			return r, true
		}
	}
	return nil, false
}

// Allows reports whether permissions (already expanded from the caller's
// roles) satisfies rule — holding any one of AnyOf is sufficient.
func (r *Rule) Allows(permissions []authz.Permission) bool {
	granted := make(map[authz.Permission]bool, len(permissions))
	for _, p := range permissions {
		granted[p] = true
	}
	for _, need := range r.AnyOf {
		if granted[need] {
			return true
		}
	}
	return false
}

// Default is the platform's known route surface as of P1: core-ledger's
// money-movement and read endpoints, reachable through the BFF's pass-
// through routes at the same paths (see docs/building-plan.md: "thin in
// this phase — auth passthrough"). Extend this table as later phases add
// services/routes; it is intentionally not derived from core-ledger's own
// route registration, since the gateway must keep working even if a
// downstream service's internal routing changes shape.
var Default = Table{
	// Wallets
	compile("POST", "/wallets", authz.PermissionWalletsWriteOwn, authz.PermissionWalletsWriteAny),
	compile("GET", "/users/:userId/wallets", authz.PermissionWalletsReadOwn, authz.PermissionWalletsReadAny),
	compile("GET", "/wallets/:walletId", authz.PermissionWalletsReadOwn, authz.PermissionWalletsReadAny),
	compile("GET", "/wallets/:walletId/statement", authz.PermissionWalletsReadOwn, authz.PermissionWalletsReadAny),
	compile("POST", "/wallets/:walletId/status", authz.PermissionWalletsStatusManage),

	// Money movement
	compile("POST", "/deposits", authz.PermissionWalletsWriteOwn, authz.PermissionWalletsWriteAny),
	compile("POST", "/withdrawals", authz.PermissionWalletsWriteOwn, authz.PermissionWalletsWriteAny),
	compile("POST", "/transfers", authz.PermissionWalletsWriteOwn, authz.PermissionWalletsWriteAny),
	compile("POST", "/fx/quotes", authz.PermissionFxQuote),
	compile("POST", "/fx/conversions", authz.PermissionFxConvert),
	compile("POST", "/issuances", authz.PermissionIssuanceCreate),
	compile("POST", "/redemptions", authz.PermissionRedemptionCreate),
	compile("POST", "/redemptions/:transactionId/confirm", authz.PermissionLedgerAdmin), // break-glass operator path, see P2
	compile("POST", "/bridges", authz.PermissionBridgeCreate),

	// Journal / ledger
	compile("GET", "/transactions/:transactionId", authz.PermissionTransactionsReadOwn, authz.PermissionTransactionsReadAny),
	compile("POST", "/transactions/:transactionId/reversal", authz.PermissionTransactionsReverse),
	compile("GET", "/accounts/:glCode/balance", authz.PermissionLedgerRead),
	compile("GET", "/ledger/trial-balance", authz.PermissionLedgerRead),
	compile("GET", "/ledger/integrity", authz.PermissionLedgerRead),
	compile("POST", "/ledger/closures", authz.PermissionLedgerAdmin),
	compile("GET", "/transfers/:correlationId", authz.PermissionTransactionsReadOwn, authz.PermissionTransactionsReadAny),
}
