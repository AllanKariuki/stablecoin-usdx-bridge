package api

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/audit-trail/internal/store"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// The recording contract producers' relays depend on: 401 without the token
// (dead-lettered, not retried), 201 the first time, 200 on a redelivery, 409
// for a different event under a recorded id. Real Postgres in
// audit_trail_test, because the dedupe is the unique index.
func TestIntegrationRecordContract(t *testing.T) {
	dsn := os.Getenv("AUDIT_TRAIL_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set AUDIT_TRAIL_TEST_DATABASE_URL to run audit-trail API integration tests")
	}
	st, err := store.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	app := fiber.New()
	New(st, slog.New(slog.NewTextHandler(io.Discard, nil)), "s3cret").Register(app)

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
