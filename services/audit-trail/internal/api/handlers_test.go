package api

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/audit-trail/internal/store"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/oidcverify"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/oidcverify/oidctest"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/testdb"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// With no token configured, local development keeps working: every caller is
// allowed through. This is the behaviour main.go permits only when ENV=local.
// The store is nil here because the middleware is exercised on its own — no
// event is written.
func TestAuthenticateProducerAllowsEmptyToken(t *testing.T) {
	h := New(nil, slog.New(slog.NewTextHandler(io.Discard, nil)), "", nil)

	app := fiber.New()
	reached := false
	app.Post("/internal/events", h.authenticateProducer, func(c *fiber.Ctx) error {
		reached = true
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodPost, "/internal/events", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("status = %d, want 204; an empty token is allowed in local mode", resp.StatusCode)
	}
	if !reached {
		t.Fatal("the recording handler was not reached")
	}
}

// The same middleware with a token configured still rejects, so the local
// allowance above does not weaken the authenticated path.
func TestAuthenticateProducerRequiresConfiguredToken(t *testing.T) {
	h := New(nil, slog.New(slog.NewTextHandler(io.Discard, nil)), "s3cret", nil)

	app := fiber.New()
	app.Post("/internal/events", h.authenticateProducer, func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodPost, "/internal/events", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 without the bearer token", resp.StatusCode)
	}
}

// H3's second door on recording: a service JWT carrying audit-trail.ingest is
// accepted beside INGEST_TOKEN, and a token without the role is refused even
// when it verifies.
func TestAuthenticateProducerAcceptsServiceJWT(t *testing.T) {
	issuer := oidctest.New(t)
	verifier, err := oidcverify.New(context.Background(), issuer.URL, "audit-trail")
	if err != nil {
		t.Fatalf("building verifier: %v", err)
	}
	h := New(nil, slog.New(slog.NewTextHandler(io.Discard, nil)), "s3cret", verifier)

	app := fiber.New()
	reached := false
	app.Post("/internal/events", h.authenticateProducer, func(c *fiber.Ctx) error {
		reached = true
		return c.SendStatus(fiber.StatusNoContent)
	})
	post := func(token string) int {
		req := httptest.NewRequest(http.MethodPost, "/internal/events", strings.NewReader(`{}`))
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		return resp.StatusCode
	}

	ingest := issuer.SignToken(t, "audit-trail", oidctest.Claims{
		Azp:         "svc-payments",
		ClientRoles: map[string][]string{"audit-trail": {roleIngest}},
	})
	if got := post(ingest); got != fiber.StatusNoContent {
		t.Fatalf("service JWT with audit-trail.ingest: %d, want 204", got)
	}
	if !reached {
		t.Fatal("the recording handler was not reached")
	}

	wrongRole := issuer.SignToken(t, "audit-trail", oidctest.Claims{
		Azp:         "svc-bff",
		ClientRoles: map[string][]string{"audit-trail": {roleUserProxy}},
	})
	if got := post(wrongRole); got != http.StatusUnauthorized {
		t.Fatalf("service JWT with only audit-trail.user-proxy: %d, want 401", got)
	}
	if got := post(""); got != http.StatusUnauthorized {
		t.Fatalf("no token at all: %d, want 401", got)
	}
}

// H3's read surface: only a service JWT carrying audit-trail.user-proxy gets
// to read; a verifiable ingest token does not.
func TestAuthenticateReaderRequiresUserProxy(t *testing.T) {
	issuer := oidctest.New(t)
	verifier, err := oidcverify.New(context.Background(), issuer.URL, "audit-trail")
	if err != nil {
		t.Fatalf("building verifier: %v", err)
	}
	h := New(nil, slog.New(slog.NewTextHandler(io.Discard, nil)), "s3cret", verifier)

	app := fiber.New()
	app.Get("/audit/events", h.authenticateReader, func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})
	get := func(token string) int {
		req := httptest.NewRequest(http.MethodGet, "/audit/events", nil)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		return resp.StatusCode
	}

	userProxy := issuer.SignToken(t, "audit-trail", oidctest.Claims{
		Azp:         "svc-bff",
		ClientRoles: map[string][]string{"audit-trail": {roleUserProxy}},
	})
	if got := get(userProxy); got != http.StatusOK {
		t.Fatalf("audit-trail.user-proxy: %d, want 200", got)
	}

	ingest := issuer.SignToken(t, "audit-trail", oidctest.Claims{
		Azp:         "svc-payments",
		ClientRoles: map[string][]string{"audit-trail": {roleIngest}},
	})
	if got := get(ingest); got != http.StatusForbidden {
		t.Fatalf("audit-trail.ingest on a read: %d, want 403", got)
	}
	if got := get(""); got != http.StatusUnauthorized {
		t.Fatalf("no token on a read: %d, want 401", got)
	}
}

// The recording contract producers' relays depend on: 401 without the token
// (dead-lettered, not retried), 201 the first time, 200 on a redelivery, 409
// for a different event under a recorded id. Real Postgres in
// audit_trail_test, because the dedupe is the unique index.
func TestIntegrationRecordContract(t *testing.T) {
	dsn := testdb.DSN(t, "AUDIT_TRAIL_TEST_DATABASE_URL")
	st, err := store.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	app := fiber.New()
	New(st, slog.New(slog.NewTextHandler(io.Discard, nil)), "s3cret", nil).Register(app)

	id := uuid.NewString()
	body := `{"id":"` + id + `","actor":"ops-1","action":"test.api.recorded","service":"test","subject_type":"THING","subject_id":"t-9"}`
	post := func(token, payload string) int {
		req := httptest.NewRequest(http.MethodPost, "/internal/events", strings.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		return resp.StatusCode
	}

	if got := post("", body); got != http.StatusUnauthorized {
		t.Fatalf("no token: %d, want 401", got)
	}
	if got := post("wrong", body); got != http.StatusUnauthorized {
		t.Fatalf("wrong token: %d, want 401", got)
	}
	if got := post("s3cret", body); got != http.StatusCreated {
		t.Fatalf("first delivery: %d, want 201", got)
	}
	if got := post("s3cret", body); got != http.StatusOK {
		t.Fatalf("redelivery: %d, want 200", got)
	}
	forged := strings.Replace(body, `"ops-1"`, `"somebody-else"`, 1)
	if got := post("s3cret", forged); got != http.StatusConflict {
		t.Fatalf("different event, same id: %d, want 409", got)
	}
}
