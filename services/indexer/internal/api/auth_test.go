package api

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"testing"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/oidcverify"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/oidcverify/oidctest"

	"github.com/gofiber/fiber/v2"
)

// The auth boundary stood up exactly as cmd/server wires it (Chain ->
// AuthMiddleware), with a stub 200 handler behind every route the table
// lists — enough for auth outcomes without a database.
func newAuthTestApp(t *testing.T) (*fiber.App, *oidctest.Server) {
	t.Helper()

	issuer := oidctest.New(t)
	verifier, err := oidcverify.New(context.Background(), issuer.URL, authClient)
	if err != nil {
		t.Fatalf("building verifier: %v", err)
	}

	app := fiber.New(fiber.Config{DisableStartupMessage: true, ErrorHandler: platform.ErrorHandler})
	platform.Chain(app, platform.ChainConfig{Service: "indexer-test", Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	health := platform.NewHealth("indexer-test", "test", "test")
	health.Register(app)
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
	resp, err := app.Test(req)
	if err != nil {
		panic(err)
	}
	return resp
}

func TestAuthBoundary(t *testing.T) {
	app, issuer := newAuthTestApp(t)

	// No token: the same 401 for every path, so a caller cannot map routes.
	if got := do(app, http.MethodGet, "/finality/ETHEREUM/0xabc", "").StatusCode; got != http.StatusUnauthorized {
		t.Fatalf("no token on finality: %d, want 401", got)
	}
	if got := do(app, http.MethodGet, "/events", "").StatusCode; got != http.StatusUnauthorized {
		t.Fatalf("no token on /events: %d, want 401", got)
	}

	// Right audience, right role: 200.
	worker := issuer.SignToken(t, authClient, oidctest.Claims{
		Azp:         "svc-core-ledger-worker",
		ClientRoles: map[string][]string{authClient: {roleFinality}},
	})
	if got := do(app, http.MethodGet, "/finality/ETHEREUM/0xabc", worker).StatusCode; got != http.StatusOK {
		t.Fatalf("worker token on finality: %d, want 200", got)
	}

	// A valid token without the role: 403.
	other := issuer.SignToken(t, authClient, oidctest.Claims{Azp: "svc-bff"})
	if got := do(app, http.MethodGet, "/finality/ETHEREUM/0xabc", other).StatusCode; got != http.StatusForbidden {
		t.Fatalf("token without the role: %d, want 403", got)
	}

	// A customer's gateway token (right issuer, wrong audience): 401.
	customer := issuer.SignToken(t, "damp-portal", oidctest.Claims{Azp: "damp-portal"})
	if got := do(app, http.MethodGet, "/finality/ETHEREUM/0xabc", customer).StatusCode; got != http.StatusUnauthorized {
		t.Fatalf("customer token: %d, want 401", got)
	}

	// Unlisted routes fail closed even with a valid worker token: /events and
	// /cursors have no rule and therefore no caller.
	if got := do(app, http.MethodGet, "/events", worker).StatusCode; got != http.StatusForbidden {
		t.Fatalf("worker token on unlisted /events: %d, want 403", got)
	}
	if got := do(app, http.MethodGet, "/cursors", worker).StatusCode; got != http.StatusForbidden {
		t.Fatalf("worker token on unlisted /cursors: %d, want 403", got)
	}

	// Probes stay open.
	if got := do(app, http.MethodGet, "/healthz", "").StatusCode; got != http.StatusOK {
		t.Fatalf("healthz: %d, want 200", got)
	}
}
