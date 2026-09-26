package api_test

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/auth-proxy/internal/api"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/auth-proxy/internal/authztable"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/auth-proxy/internal/identityclient"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/auth-proxy/internal/oidcverify"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/auth-proxy/internal/testoidc"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/requestid"
)

const testAudience = "damp-portal"

// stubResolver maps a fixed set of subjects to party/org ids without a
// network call, standing in for services/identity in these tests.
type stubResolver map[string][2]string

func (s stubResolver) Resolve(_ context.Context, subject string) (string, string, error) {
	v, ok := s[subject]
	if !ok {
		return subject, "", nil
	}
	return v[0], v[1], nil
}

func newTestApp(t *testing.T, issuer *testoidc.Server) *fiber.App {
	t.Helper()
	verifier, err := oidcverify.New(context.Background(), issuer.URL, testAudience)
	if err != nil {
		t.Fatalf("discovery: %v", err)
	}
	resolver := stubResolver{"alice-sub": {"party-alice", "org-1"}}

	app := fiber.New()
	app.Use(requestid.New())
	api.New(verifier, resolver, authztable.Default).Register(app)
	return app
}

func TestVerify_ValidCustomerCanReadOwnWallet(t *testing.T) {
	issuer := testoidc.New(t)
	app := newTestApp(t, issuer)

	token := issuer.SignToken(t, testAudience, testoidc.Claims{Subject: "alice-sub", Roles: []string{"customer"}})

	req := httptest.NewRequest("GET", "/verify", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Forwarded-Method", "GET")
	req.Header.Set("X-Forwarded-Uri", "/wallets/abc-123")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if got := resp.Header.Get("X-User-Id"); got != "party-alice" {
		t.Errorf("expected X-User-Id party-alice, got %q", got)
	}
	if got := resp.Header.Get("X-Org-Id"); got != "org-1" {
		t.Errorf("expected X-Org-Id org-1, got %q", got)
	}
	if got := resp.Header.Get("X-Roles"); got != "customer" {
		t.Errorf("expected X-Roles customer, got %q", got)
	}
	if got := resp.Header.Get("X-Permissions"); got == "" {
		t.Error("expected a non-empty X-Permissions header")
	}
	if got := resp.Header.Get("X-Request-Id"); got == "" {
		t.Error("expected a non-empty X-Request-Id header")
	}
}

func TestVerify_CustomerCannotClosePeriod(t *testing.T) {
	issuer := testoidc.New(t)
	app := newTestApp(t, issuer)

	// /ledger/closures requires ledger:admin, which customer never holds —
	// see shared/authz/permissions.yaml.
	token := issuer.SignToken(t, testAudience, testoidc.Claims{Subject: "alice-sub", Roles: []string{"customer"}})

	req := httptest.NewRequest("POST", "/verify", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Forwarded-Method", "POST")
	req.Header.Set("X-Forwarded-Uri", "/ledger/closures")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}
}

func TestVerify_TreasuryCanClosePeriod(t *testing.T) {
	issuer := testoidc.New(t)
	app := newTestApp(t, issuer)

	token := issuer.SignToken(t, testAudience, testoidc.Claims{Subject: "bob-sub", Roles: []string{"treasury"}})

	req := httptest.NewRequest("POST", "/verify", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Forwarded-Method", "POST")
	req.Header.Set("X-Forwarded-Uri", "/ledger/closures")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestVerify_MissingTokenRejected(t *testing.T) {
	issuer := testoidc.New(t)
	app := newTestApp(t, issuer)

	req := httptest.NewRequest("GET", "/verify", nil)
	req.Header.Set("X-Forwarded-Method", "GET")
	req.Header.Set("X-Forwarded-Uri", "/wallets/abc-123")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestVerify_ForgedUserIdHeaderNeverTrusted(t *testing.T) {
	// A caller trying to smuggle an identity by sending X-User-Id directly
	// must not see it echoed back — the response is always derived from
	// the verified token's subject, never from an inbound header (which
	// Traefik strips inbound anyway — see infra/traefik/dynamic.yaml).
	issuer := testoidc.New(t)
	app := newTestApp(t, issuer)

	token := issuer.SignToken(t, testAudience, testoidc.Claims{Subject: "alice-sub", Roles: []string{"customer"}})

	req := httptest.NewRequest("GET", "/verify", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Forwarded-Method", "GET")
	req.Header.Set("X-Forwarded-Uri", "/wallets/abc-123")
	req.Header.Set("X-User-Id", "someone-else")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if got := resp.Header.Get("X-User-Id"); got != "party-alice" {
		t.Fatalf("expected the verified party id party-alice regardless of a forged inbound header, got %q", got)
	}
}

func TestVerify_UnlistedRouteRejected(t *testing.T) {
	issuer := testoidc.New(t)
	app := newTestApp(t, issuer)

	token := issuer.SignToken(t, testAudience, testoidc.Claims{Subject: "alice-sub", Roles: []string{"admin"}})

	req := httptest.NewRequest("GET", "/verify", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Forwarded-Method", "GET")
	req.Header.Set("X-Forwarded-Uri", "/not/a/real/route")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected 403 (deny by default) for an unlisted route, got %d", resp.StatusCode)
	}
}

func TestVerify_MissingForwardedHeadersRejected(t *testing.T) {
	issuer := testoidc.New(t)
	app := newTestApp(t, issuer)

	req := httptest.NewRequest("GET", "/verify", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusBadRequest {
		t.Fatalf("expected 400 when called without X-Forwarded-Method/Uri, got %d", resp.StatusCode)
	}
}

func TestVerify_QueryStringStrippedBeforeRouteMatch(t *testing.T) {
	issuer := testoidc.New(t)
	app := newTestApp(t, issuer)

	token := issuer.SignToken(t, testAudience, testoidc.Claims{Subject: "alice-sub", Roles: []string{"customer"}})

	req := httptest.NewRequest("GET", "/verify", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Forwarded-Method", "GET")
	req.Header.Set("X-Forwarded-Uri", "/wallets/abc-123?foo=bar")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

var _ identityclient.Resolver = stubResolver{}
