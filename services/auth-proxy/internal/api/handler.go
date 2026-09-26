// Package api implements the Traefik ForwardAuth endpoint: verify the
// caller's bearer token, expand its roles to permissions, check the
// request's route→permission requirement, resolve a party id, and either
// return 200 with the identity headers Traefik copies onto the forwarded
// request, or reject with 401/403.
package api

import (
	"strings"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/auth-proxy/internal/authztable"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/auth-proxy/internal/identityclient"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/auth-proxy/internal/oidcverify"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/authz/generated"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
)

type Handler struct {
	verifier *oidcverify.Verifier
	resolver identityclient.Resolver
	routes   authztable.Table
}

func New(verifier *oidcverify.Verifier, resolver identityclient.Resolver, routes authztable.Table) *Handler {
	return &Handler{verifier: verifier, resolver: resolver, routes: routes}
}

func (h *Handler) Register(app *fiber.App) {
	// Traefik's ForwardAuth middleware always sends the auth service a GET
	// (or the configured forwardBody method), carrying the ORIGINAL
	// request's method/URI in X-Forwarded-Method/X-Forwarded-Uri — the
	// request line here is never the thing being authorized. See
	// infra/traefik/dynamic.yaml for the middleware config that sets this
	// up and lists authResponseHeaders.
	app.All("/verify", h.verify)
}

func (h *Handler) verify(c *fiber.Ctx) error {
	method := c.Get("X-Forwarded-Method")
	path := c.Get("X-Forwarded-Uri")
	if method == "" || path == "" {
		return platform.WriteError(c, fiber.StatusBadRequest, "MISSING_FORWARDED_HEADERS",
			"X-Forwarded-Method and X-Forwarded-Uri are required (is this being called directly instead of via Traefik ForwardAuth?)")
	}
	// Strip a query string before route matching — /wallets/:id?foo=bar
	// must match the same rule as /wallets/:id.
	if idx := strings.IndexByte(path, '?'); idx >= 0 {
		path = path[:idx]
	}

	rule, found := h.routes.Match(method, path)
	if !found {
		// Deny by default: an unlisted route is not a public route, it's a
		// route this table hasn't been taught about yet.
		return platform.WriteError(c, fiber.StatusForbidden, "ROUTE_NOT_AUTHORIZED", "no permission rule for this route")
	}

	token := bearerToken(c.Get("Authorization"))
	if token == "" {
		return platform.WriteError(c, fiber.StatusUnauthorized, "MISSING_TOKEN", "missing bearer token")
	}

	claims, err := h.verifier.Verify(c.Context(), token)
	if err != nil {
		return platform.WriteError(c, fiber.StatusUnauthorized, "INVALID_TOKEN", "invalid or expired token")
	}

	roles := make([]authz.Role, 0, len(claims.Roles))
	for _, r := range claims.Roles {
		roles = append(roles, authz.Role(r))
	}
	permissions := authz.ExpandRoles(roles)

	if !rule.Allows(permissions) {
		return platform.WriteError(c, fiber.StatusForbidden, "INSUFFICIENT_PERMISSIONS", "caller lacks a required permission for this route")
	}

	partyID, orgID, err := h.resolver.Resolve(c.Context(), claims.Subject)
	if err != nil {
		return platform.WriteError(c, fiber.StatusInternalServerError, "IDENTITY_LOOKUP_FAILED", "resolving caller identity")
	}

	c.Set("X-User-Id", partyID)
	c.Set("X-Org-Id", orgID)
	c.Set("X-Roles", strings.Join(claims.Roles, ","))
	c.Set("X-Permissions", joinPermissions(permissions))
	c.Set("X-Request-Id", platform.RequestID(c))
	return c.SendStatus(fiber.StatusOK)
}

func bearerToken(header string) string {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, prefix))
}

func joinPermissions(perms []authz.Permission) string {
	strs := make([]string, len(perms))
	for i, p := range perms {
		strs[i] = string(p)
	}
	return strings.Join(strs, ",")
}
