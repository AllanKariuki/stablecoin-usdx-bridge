package audit

import (
	"strings"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
)

// Middleware captures the request facts an audit event carries — request id,
// source IP, user agent, the roles auth-proxy resolved — onto both of fiber's
// contexts, so whichever one a handler passes down reaches Enqueue with them.
//
// Install it after platform.Chain: the request id it reads is the one Chain's
// requestid middleware set (itself the gateway's X-Request-Id when present),
// which is what ties an audit event to the same request in every service's
// logs.
//
// X-Roles is trusted for the reason X-User-Id is everywhere on this platform:
// Traefik strips it inbound and only auth-proxy sets it.
func Middleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		r := Request{
			ID:        platform.RequestID(c),
			SourceIP:  sourceIP(c),
			UserAgent: c.Get(fiber.HeaderUserAgent),
			Roles:     splitRoles(c.Get("X-Roles")),
		}
		c.Context().SetUserValue(requestKey{}, r)
		c.SetUserContext(WithRequest(c.UserContext(), r))
		return c.Next()
	}
}

// sourceIP prefers the first X-Forwarded-For hop: behind Traefik, c.IP() is
// the gateway's address on every request, which is true and useless.
func sourceIP(c *fiber.Ctx) string {
	if xff := c.Get(fiber.HeaderXForwardedFor); xff != "" {
		first, _, _ := strings.Cut(xff, ",")
		if first = strings.TrimSpace(first); first != "" {
			return first
		}
	}
	return c.IP()
}

func splitRoles(header string) []string {
	if header == "" {
		return nil
	}
	var out []string
	for _, r := range strings.Split(header, ",") {
		if r = strings.TrimSpace(r); r != "" {
			out = append(out, r)
		}
	}
	return out
}
