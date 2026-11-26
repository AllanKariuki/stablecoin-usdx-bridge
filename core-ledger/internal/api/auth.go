package api

import (
	"regexp"
	"strings"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/oidcverify"

	"github.com/gofiber/fiber/v2"
)

// H2's authentication boundary: every API request must carry a Keycloak
// service-account JWT whose audience is the `core-ledger` resource client,
// and the route table below decides which of that client's roles authorizes
// which route. There is no unauthenticated path and no disable switch —
// core-ledger holds the money, and "the gateway stops the browsers" is not
// an answer to "the cluster network is flat".

// The client roles the `core-ledger` bearer-only resource client defines
// (infra/keycloak/templates/damp-realm.template.json, synced into a running
// Keycloak by scripts/keycloak-sync.sh). One role per calling *service
// surface*, not per route: the role answers "who is this caller", and the
// route table answers "what may that caller touch".
const (
	// roleUserProxy is bff's role. bff (fronted by auth-proxy's realm-role
	// checks) forwards every user-facing route and the whole operator
	// surface, so this role opens the full bff footprint — including routes
	// nothing else currently calls (fx/*, ledger/fees, ledger/journals,
	// sagas/dead-letters), which stay operator-only-by-way-of-bff.
	roleUserProxy = "ledger.user-proxy"
	// roleSettlement is services/payments' role: the routes a payment intent
	// settles through.
	roleSettlement = "ledger.settlement"
	// rolePricing is services/pricing's role: issue FX quotes. Quote creation
	// is locked to this single role so no other caller — including the
	// user-facing surface — can mint a rate; a conversion is only as honest
	// as the quote it consumes.
	rolePricing = "ledger.pricing"
	// roleWalletProvision is services/identity's role: create a party's
	// default wallet.
	roleWalletProvision = "ledger.wallet-provision"
	// roleWalletStatus is services/kyc's and services/compliance's role:
	// list a party's wallets and freeze/thaw them.
	roleWalletStatus = "ledger.wallet-status"
	// roleEnforcement is services/compliance's H6 role: submit a maker-checked
	// enforcement action (BLACKLIST/UNBLACKLIST/PAUSE/UNPAUSE) on chain.
	// Nobody else holds it — the route submits transactions with the relayer's
	// keys, and the only caller it exists for is an approved compliance action.
	roleEnforcement = "ledger.enforcement"
	// roleReservesCustodian is services/rms' role: post custodian snapshots
	// and read the reserve status it reports against.
	roleReservesCustodian = "ledger.reserves.custodian"
	// roleReservesChainSupply is services/indexer's role: post what a chain
	// holds at a height.
	roleReservesChainSupply = "ledger.reserves.chain-supply"
	// roleReportsRead is services/reporting's role: the read surface a
	// report run assembles from.
	roleReportsRead = "ledger.reports.read"
	// roleTreasury is services/rms' treasury desk role: post rebalance
	// journal entries when the desk buys or sells custodial crypto at a
	// custodian. rms alone holds it — a rebalance posting moves the house's
	// own position, and no user-facing surface should ever produce one.
	roleTreasury = "ledger.treasury"
)

// authClient is the resource client whose roles authorize this API — the
// same string the verifier was built with as its audience.
const authClient = "core-ledger"

// authClientLocalsKey is the fiber Locals key the verified azp is stored
// under, for actor() to fall back to "service:<azp>".
const authClientLocalsKey = "auth.client"

// authRule is one route→roles mapping. Path uses Fiber-style :param
// segments, translated to a regexp at build time (same approach as
// services/auth-proxy/internal/authztable).
type authRule struct {
	Method     string
	Path       string
	Roles      []string
	pathRegexp *regexp.Regexp
}

type authzTable []*authRule

var authParamSegment = regexp.MustCompile(`:[^/]+`)

// compile turns a Fiber-style path ("/wallets/:walletId") into a regexp
// matching any value in the :param position. Path segments here are fixed,
// developer-authored strings (not user input), so building the regexp by
// substitution before quoting — rather than quoting first, which would also
// escape the ':' this substitution looks for — is safe.
func compile(method, path string, roles ...string) *authRule {
	return &authRule{
		Method:     method,
		Path:       path,
		Roles:      roles,
		pathRegexp: regexp.MustCompile("^" + authParamSegment.ReplaceAllString(path, `[^/]+`) + "$"),
	}
}

// match returns the rule authorizing method+path, and whether one was
// found. A path with no matching rule is denied by default: an unlisted
// route is not a public route, it's a route this table hasn't been taught
// about yet.
func (t authzTable) match(method, path string) (*authRule, bool) {
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

func (r *authRule) allows(claims *oidcverify.Claims) bool {
	for _, role := range r.Roles {
		if claims.HasClientRole(authClient, role) {
			return true
		}
	}
	return false
}

// routeTable is core-ledger's complete HTTP surface (handlers.go's Register
// plus reserves.go's registerReserves), one line per route. A role listed
// on a line is sufficient on its own. Keep this in step with Register —
// auth-proxy's route table comment explains why the gateway's table is
// intentionally NOT derived from the downstream service's registration, but
// here the table guards the service itself, so a route added without a rule
// fails closed as a 403 the moment it is first called.
var routeTable = authzTable{
	// Wallets
	compile("POST", "/wallets", roleWalletProvision, roleSettlement, roleUserProxy),
	compile("GET", "/users/:userId/wallets", roleWalletStatus, roleUserProxy),
	compile("GET", "/wallets/:walletId", roleUserProxy),
	compile("PATCH", "/wallets/:walletId", roleUserProxy),
	compile("GET", "/wallets/:walletId/statement", roleUserProxy, roleReportsRead),
	compile("POST", "/wallets/:walletId/status", roleWalletStatus, roleUserProxy),

	// Chain enforcement (H6): the only routes that submit with compliance
	// authority, and the only ones that role exists for. The GET is the
	// stored-state poll for a submitted reference.
	compile("POST", "/chain/enforcement", roleEnforcement),
	compile("GET", "/chain/enforcement/:reference", roleEnforcement),

	// Money movement. Every write goes through h.idempotent.
	compile("POST", "/deposits", roleSettlement, roleUserProxy),
	compile("POST", "/withdrawals", roleSettlement, roleUserProxy),
	compile("POST", "/transfers", roleSettlement, roleUserProxy),
	compile("POST", "/fx/quotes", rolePricing),
	compile("POST", "/fx/conversions", roleUserProxy),
	compile("POST", "/fx/payments", roleSettlement),
	compile("POST", "/issuances", roleUserProxy),
	compile("POST", "/redemptions", roleUserProxy),
	// confirmRedemption is operator break-glass (see handlers.go); it stays
	// behind user-proxy, i.e. bff + auth-proxy's ledger:admin.
	compile("POST", "/redemptions/:transactionId/confirm", roleUserProxy),
	// The break-glass proposal's status, polled by the ops console and the
	// e2e harness (H4).
	compile("GET", "/redemptions/:transactionId/break-glass", roleUserProxy),
	compile("POST", "/bridges", roleUserProxy),

	// Journal / ledger
	compile("GET", "/transactions", roleUserProxy, roleReportsRead),
	compile("GET", "/transactions/:transactionId", roleUserProxy),
	compile("POST", "/transactions/:transactionId/reversal", roleUserProxy),
	compile("GET", "/accounts", roleUserProxy),
	compile("GET", "/accounts/:glCode/balance", roleUserProxy),
	compile("GET", "/ledger/trial-balance", roleUserProxy, roleReportsRead),
	compile("GET", "/ledger/integrity", roleUserProxy),
	compile("POST", "/ledger/closures", roleUserProxy),

	// Operator surface. No current caller outside bff's proxy: both stay
	// user-proxy-only so they remain an operator surface, never a
	// service-to-service one.
	compile("POST", "/ledger/fees", roleUserProxy),
	compile("POST", "/ledger/journals", roleUserProxy),

	// Reserves and reconciliation (P3). The writers are service-to-service
	// calls — each gets exactly its own role, not user-proxy, because a
	// reconciliation input is a way to make the peg look healthy while it
	// isn't (same reasoning as auth-proxy's table keeping them off the
	// gateway). The reads serve the ops console (via bff) and reporting.
	compile("POST", "/reserves/chain-supply-snapshots", roleReservesChainSupply),
	compile("POST", "/reserves/custodian-snapshots", roleReservesCustodian),
	compile("GET", "/reserves/status", roleReservesCustodian, roleUserProxy, roleReportsRead),
	compile("GET", "/reserves/reconciliation-runs", roleUserProxy, roleReportsRead),
	compile("GET", "/reserves/reconciliation-runs/:runId", roleUserProxy, roleReportsRead),
	compile("GET", "/reserves/reconciliation-breaks", roleUserProxy, roleReportsRead),

	// Treasury & custodial-crypto exposure. The positions read serves rms'
	// exposure checks (via ledger.reserves.custodian), the ops console and
	// reporting; the rebalance writer is rms' treasury desk alone — the same
	// writer-isolation reasoning as the reserves writers above.
	compile("GET", "/treasury/positions", roleReservesCustodian, roleUserProxy, roleReportsRead),
	compile("POST", "/treasury/rebalances", roleTreasury),

	// Bridge saga state
	compile("GET", "/transfers/:correlationId", roleUserProxy),
	// Dead letters: operator surface via bff only.
	compile("GET", "/sagas/dead-letters", roleUserProxy),
	compile("POST", "/sagas/dead-letters/:correlationId/resolve", roleUserProxy),
}

// exemptPaths answer probes and scraping without a token — /healthz,
// /readyz and /metrics are the exact routes platform.Health.Register and
// platform.Metrics mount, and nothing else is exempt.
var exemptPaths = map[string]bool{
	"/healthz": true,
	"/readyz":  true,
	"/metrics": true,
}

// hmacPaths are exempt from the JWT check for the opposite reason from
// exemptPaths: they are still authenticated, but by a workflow HMAC instead
// of a service token. It is an explicit set — one entry per path, added when
// a handler exists to enforce the HMAC — never a blanket exemption, because
// a path that slips through both checks would be an anonymous route into a
// service that holds the money.
//
// This is core-ledger's counterpart of H3's @HmacAuthenticated on the Node
// services: services/workflow signs its decision callbacks with
// WORKFLOW_CALLBACK_SECRET, and the handler refuses an unsigned or
// mis-signed call with 401.
var hmacPaths = map[string]bool{
	"/internal/approvals/callback": true,
}

// AuthMiddleware verifies the bearer token, checks the route table, and
// stores the verified azp for actor(). Register it before the handlers
// (and before the audit middleware, so a rejected call never reaches a
// handler that could record it).
//
// Responses use the platform error envelope: missing/invalid token -> 401
// UNAUTHENTICATED, valid token without a matching role -> 403 FORBIDDEN.
func AuthMiddleware(verifier *oidcverify.Verifier) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if exemptPaths[c.Path()] {
			return c.Next()
		}
		// HMAC-authenticated routes skip the JWT check here; the handler
		// itself enforces the HMAC (see hmacPaths).
		if hmacPaths[c.Path()] {
			return c.Next()
		}

		// Authenticate before consulting the route table, so an unauthenticated
		// caller gets the same 401 for every path and cannot map which routes
		// exist.
		token := oidcverify.BearerToken(c.Get("Authorization"))
		if token == "" {
			return platform.WriteError(c, fiber.StatusUnauthorized, "UNAUTHENTICATED", "missing bearer token")
		}

		claims, err := verifier.Verify(c.Context(), token)
		if err != nil {
			return platform.WriteError(c, fiber.StatusUnauthorized, "UNAUTHENTICATED", "invalid or expired token")
		}

		c.Locals(authClientLocalsKey, claims.AuthorizedParty)

		rule, found := routeTable.match(c.Method(), c.Path())
		if !found {
			// Default-deny: no rule, no route.
			return platform.WriteError(c, fiber.StatusForbidden, "FORBIDDEN", "no client role authorizes this route")
		}
		if !rule.allows(claims) {
			return platform.WriteError(c, fiber.StatusForbidden, "FORBIDDEN", "caller lacks the client role for this route")
		}
		return c.Next()
	}
}
