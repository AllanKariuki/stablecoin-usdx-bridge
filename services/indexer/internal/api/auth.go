package api

import (
	"regexp"
	"strings"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/oidcverify"

	"github.com/gofiber/fiber/v2"
)

// H3's authentication boundary for the indexer's read surface, the twin of
// core-ledger/internal/api/auth.go. Every request must carry a Keycloak
// service-account JWT whose audience is the `indexer` resource client, and
// the route table below decides which of that client's roles authorizes
// which route. A path with no rule is denied by default — an unlisted route
// is not a public route, it is a route this table hasn't been taught about
// yet.

const (
	// roleFinality is svc-core-ledger-worker's role: the saga's finality
	// check, GET /finality/:chain/:txHash.
	roleFinality = "indexer.finality"
	// authClient is the resource client whose roles authorize this API — the
	// same string the verifier was built with as its audience.
	authClient = "indexer"
)

// authRule is one route→roles mapping, with the same Fiber-style :param
// translation core-ledger uses.
type authRule struct {
	Method     string
	Path       string
	Roles      []string
	pathRegexp *regexp.Regexp
}

type authzTable []*authRule

var authParamSegment = regexp.MustCompile(`:[^/]+`)

func compile(method, path string, roles ...string) *authRule {
	return &authRule{
		Method:     method,
		Path:       path,
		Roles:      roles,
		pathRegexp: regexp.MustCompile("^" + authParamSegment.ReplaceAllString(path, `[^/]+`) + "$"),
	}
}

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

// routeTable is the indexer's complete HTTP surface (handlers.go's
// Register). /finality is the one route another service calls; /events and
// /cursors are operator reads with no current caller, so they carry no rule
// and fail closed — a role can be added the day something needs them.
var routeTable = authzTable{
	compile("GET", "/finality/:chain/:txHash", roleFinality),
}

// exemptPaths answer probes and scraping without a token — the exact routes
// platform.Health.Register and platform.Metrics mount.
var exemptPaths = map[string]bool{
	"/healthz": true,
	"/readyz":  true,
	"/metrics": true,
}

// AuthMiddleware verifies the bearer token and checks the route table:
// missing/invalid token -> 401 UNAUTHENTICATED, valid token without a
// matching role -> 403 FORBIDDEN. Register it before the handlers.
func AuthMiddleware(verifier *oidcverify.Verifier) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if exemptPaths[c.Path()] {
			return c.Next()
		}

		// Authenticate before consulting the route table, so an unauthenticated
		// caller gets the same 401 for every path and cannot map which routes
		// exist.
		token := oidcverify.BearerToken(c.Get(fiber.HeaderAuthorization))
		if token == "" {
			return platform.WriteError(c, fiber.StatusUnauthorized, "UNAUTHENTICATED", "missing bearer token")
		}

		claims, err := verifier.Verify(c.Context(), token)
		if err != nil {
			return platform.WriteError(c, fiber.StatusUnauthorized, "UNAUTHENTICATED", "invalid or expired token")
		}

		rule, found := routeTable.match(c.Method(), c.Path())
		if !found {
			return platform.WriteError(c, fiber.StatusForbidden, "FORBIDDEN", "no client role authorizes this route")
		}
		if !rule.allows(claims) {
			return platform.WriteError(c, fiber.StatusForbidden, "FORBIDDEN", "caller lacks the client role for this route")
		}
		return c.Next()
	}
}
