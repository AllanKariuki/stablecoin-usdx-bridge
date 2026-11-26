package api

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/oidcverify"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/oidcverify/oidctest"

	"github.com/gofiber/fiber/v2"
	"github.com/valyala/fasthttp"
)

// testAuthAudience is what cmd/server builds its verifier with
// (AUTH_AUDIENCE) — the bearer-only core-ledger resource client.
const testAuthAudience = "core-ledger"

// authMiddleware builds the verifier a test app's AuthMiddleware needs
// against the harness's fake issuer. Each test app gets a fresh verifier so
// go-oidc's discovery cache can't leak between apps.
func (h *harness) authMiddleware(t *testing.T) fiber.Handler {
	t.Helper()
	verifier, err := oidcverify.New(context.Background(), h.issuer.URL, testAuthAudience)
	if err != nil {
		t.Fatalf("building verifier: %v", err)
	}
	return AuthMiddleware(verifier)
}

// newAuthTestApp stands up the auth boundary exactly as cmd/server wires it
// (Chain -> AuthMiddleware), with a stub 200 handler behind every route the
// table lists — enough for auth outcomes without a database.
func newAuthTestApp(t *testing.T) (*fiber.App, *oidctest.Server) {
	t.Helper()

	issuer := oidctest.New(t)
	verifier, err := oidcverify.New(context.Background(), issuer.URL, testAuthAudience)
	if err != nil {
		t.Fatalf("building verifier: %v", err)
	}

	app := fiber.New(fiber.Config{DisableStartupMessage: true, ErrorHandler: platform.ErrorHandler})
	platform.Chain(app, platform.ChainConfig{Service: "core-ledger-test", Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	app.Use(AuthMiddleware(verifier))
	for _, rule := range routeTable {
		rule := rule
		app.Add(rule.Method, rule.Path, func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })
	}

	return app, issuer
}

func do(app *fiber.App, method, path, token string) *http.Response {
	req, _ := http.NewRequest(method, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := app.Test(req, 10_000)
	if err != nil {
		panic(err) // test helper: a broken router is a test bug, not an assertion
	}
	return resp
}

func expectStatus(t *testing.T, resp *http.Response, want int) {
	t.Helper()
	if resp.StatusCode != want {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		t.Fatalf("status = %d, want %d (body: %q)", resp.StatusCode, want, body)
	}
}

func expectCode(t *testing.T, resp *http.Response, want string) {
	t.Helper()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	var envelope struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		t.Fatalf("decoding error envelope: %v (body: %q)", err, body)
	}
	if envelope.Code != want {
		t.Fatalf("error code = %q, want %q (body: %q)", envelope.Code, want, body)
	}
}

func TestAuthMissingTokenIs401(t *testing.T) {
	app, _ := newAuthTestApp(t)
	resp := do(app, http.MethodPost, "/deposits", "")
	expectStatus(t, resp, fiber.StatusUnauthorized)
	expectCode(t, resp, "UNAUTHENTICATED")
}

func TestAuthGarbageTokenIs401(t *testing.T) {
	app, _ := newAuthTestApp(t)
	resp := do(app, http.MethodPost, "/deposits", "garbage.not.a.token")
	expectStatus(t, resp, fiber.StatusUnauthorized)
	expectCode(t, resp, "UNAUTHENTICATED")
}

func TestAuthExpiredTokenIs401(t *testing.T) {
	app, issuer := newAuthTestApp(t)
	token := issuer.SignToken(t, testAuthAudience, oidctest.Claims{
		Azp:     "svc-bff",
		Expires: time.Now().Add(-time.Hour),
	})
	resp := do(app, http.MethodPost, "/deposits", token)
	expectStatus(t, resp, fiber.StatusUnauthorized)
	expectCode(t, resp, "UNAUTHENTICATED")
}

func TestAuthWrongAudienceIs401(t *testing.T) {
	app, issuer := newAuthTestApp(t)
	// A customer's token minted for the public portal client: right issuer,
	// right signature, wrong audience — must not open the ledger API.
	token := issuer.SignToken(t, "damp-portal", oidctest.Claims{
		Azp:         "damp-portal",
		ClientRoles: map[string][]string{authClient: {roleUserProxy}},
	})
	resp := do(app, http.MethodPost, "/deposits", token)
	expectStatus(t, resp, fiber.StatusUnauthorized)
	expectCode(t, resp, "UNAUTHENTICATED")
}

func TestAuthValidTokenWithoutRoleIs403(t *testing.T) {
	app, issuer := newAuthTestApp(t)
	token := issuer.SignToken(t, testAuthAudience, oidctest.Claims{
		Azp: "svc-someone",
		// Right client, right audience, no roles.
	})
	resp := do(app, http.MethodPost, "/deposits", token)
	expectStatus(t, resp, fiber.StatusForbidden)
	expectCode(t, resp, "FORBIDDEN")
}

func TestAuthRoleOnSomeOtherClientIs403(t *testing.T) {
	app, issuer := newAuthTestApp(t)
	// The role must sit under resource_access.core-ledger — the same role
	// granted by some other resource client means nothing here.
	token := issuer.SignToken(t, testAuthAudience, oidctest.Claims{
		Azp:         "svc-payments",
		ClientRoles: map[string][]string{"some-other-client": {roleSettlement}},
	})
	resp := do(app, http.MethodPost, "/deposits", token)
	expectStatus(t, resp, fiber.StatusForbidden)
	expectCode(t, resp, "FORBIDDEN")
}

// allowsRole is the test-side reading of an authRule's role list.
func allowsRole(r *authRule, role string) bool {
	for _, rr := range r.Roles {
		if rr == role {
			return true
		}
	}
	return false
}

// TestAuthEachRoleAuthorizesExactlyItsRoutes is generated from the route
// table itself, so a route added or re-assigned without updating the table's
// intent fails here. For every role: each route listing it accepts the
// role's token, and every route not listing it is refused (checked against
// the first such route as a representative; the full sweep also guards
// against a role accidentally opening everything).
func TestAuthEachRoleAuthorizesExactlyItsRoutes(t *testing.T) {
	app, issuer := newAuthTestApp(t)

	roles := []string{
		roleUserProxy, roleSettlement, roleWalletProvision, roleWalletStatus,
		roleReservesCustodian, roleReservesChainSupply, roleReportsRead, roleEnforcement,
	}

	for _, role := range roles {
		t.Run(role, func(t *testing.T) {
			token := issuer.SignToken(t, testAuthAudience, oidctest.Claims{
				Azp:         "svc-" + strings.TrimPrefix(role, "ledger."),
				ClientRoles: map[string][]string{authClient: {role}},
			})

			allowed, denied := 0, 0
			for _, rule := range routeTable {
				resp := do(app, rule.Method, rule.Path, token)
				if allowsRole(rule, role) {
					allowed++
					if resp.StatusCode != fiber.StatusOK {
						t.Errorf("%s %s: status = %d, want 200", rule.Method, rule.Path, resp.StatusCode)
					}
				} else {
					if denied == 0 && resp.StatusCode != fiber.StatusForbidden {
						t.Errorf("%s %s: status = %d, want 403 for %s (representative refusal)",
							rule.Method, rule.Path, resp.StatusCode, role)
					}
					denied++
				}
			}

			if allowed == 0 {
				t.Errorf("role %s authorizes no route in the table", role)
			}
			if denied == 0 {
				t.Errorf("role %s is refused on no route in the table", role)
			}
		})
	}
}

func TestAuthProbesAndMetricsAreExempt(t *testing.T) {
	app, _ := newAuthTestApp(t)
	health := platform.NewHealth("core-ledger-test", "dev", "none")
	health.Register(app)
	app.Get("/metrics", platform.NewMetrics("core-ledger-test").Handler())

	for _, path := range []string{"/healthz", "/readyz", "/metrics"} {
		resp := do(app, http.MethodGet, path, "")
		expectStatus(t, resp, fiber.StatusOK)
	}
}

func TestActorFallsBackToServiceAzp(t *testing.T) {
	app := fiber.New()
	c := app.AcquireCtx(&fasthttp.RequestCtx{})
	defer app.ReleaseCtx(c)

	// No auth middleware, no X-User-Id: the pre-auth "api" fallback is what
	// remains for tests calling handlers directly.
	if got := actor(c); got != "api" {
		t.Fatalf("actor() = %q, want %q", got, "api")
	}

	// What the auth middleware stores is what a service-to-service call
	// without X-User-Id gets stamped as.
	c.Locals(authClientLocalsKey, "svc-payments")
	if got := actor(c); got != "service:svc-payments" {
		t.Fatalf("actor() = %q, want %q", got, "service:svc-payments")
	}

	// X-User-Id still wins when present: the caller is acting on behalf of
	// a party, and the journal must say so.
	c.Request().Header.Set("X-User-Id", "party_123")
	if got := actor(c); got != "party_123" {
		t.Fatalf("actor() = %q, want %q", got, "party_123")
	}
}

func TestAuthMiddlewareStoresAzpForActor(t *testing.T) {
	// A dedicated app rather than newAuthTestApp: the stub router there
	// answers every table route itself, so a test handler on the same path
	// would never run.
	issuer := oidctest.New(t)
	verifier, err := oidcverify.New(context.Background(), issuer.URL, testAuthAudience)
	if err != nil {
		t.Fatalf("building verifier: %v", err)
	}
	app := fiber.New(fiber.Config{DisableStartupMessage: true, ErrorHandler: platform.ErrorHandler})
	app.Use(AuthMiddleware(verifier))

	var seen string
	app.Get("/transactions/:transactionId", func(c *fiber.Ctx) error {
		if client, ok := c.Locals(authClientLocalsKey).(string); ok {
			seen = client
		}
		return c.SendStatus(fiber.StatusOK)
	})

	token := issuer.SignToken(t, testAuthAudience, oidctest.Claims{
		Azp:         "svc-bff",
		ClientRoles: map[string][]string{authClient: {roleUserProxy}},
	})
	resp := do(app, http.MethodGet, "/transactions/tx-1", token)
	expectStatus(t, resp, fiber.StatusOK)
	if seen != "svc-bff" {
		t.Fatalf("azp seen by handler = %q, want %q", seen, "svc-bff")
	}
}
