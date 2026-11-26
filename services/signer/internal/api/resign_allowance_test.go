package api

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/audit"

	"github.com/gofiber/fiber/v2"
)

// POST /resign-allowances: the H7 endpoint that raises one correlation's
// re-sign cap at runtime instead of restarting with a bigger global cap.
// Who may call it is policy (resign_allowance.allowed_callers), and every
// grant is appended to the hash-chained audit log as method
// resign-allowance — the database half (one active grant, the chained
// record, the cap honouring the extra) is tested in internal/audit.

type allowanceOut struct {
	status        int
	code          string
	correlationID string
	extra         int
	grantedBy     string
	expiresAt     string
}

func grant(t *testing.T, app *fiber.App, body map[string]any) allowanceOut {
	t.Helper()
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/resign-allowances", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out struct {
		CorrelationID string `json:"correlation_id"`
		Extra         int    `json:"extra"`
		GrantedBy     string `json:"granted_by"`
		ExpiresAt     string `json:"expires_at"`
		Code          string `json:"code"`
		Error         string `json:"error"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return allowanceOut{
		status: resp.StatusCode, code: out.Code, correlationID: out.CorrelationID,
		extra: out.Extra, grantedBy: out.GrantedBy, expiresAt: out.ExpiresAt,
	}
}

// An allowed caller grants, and the grant is readable back.
func TestGrantResignAllowance(t *testing.T) {
	log := &memLog{}
	app := newAppAs(log, &fakeBackend{}, ops)

	got := grant(t, app, map[string]any{
		"correlation_id": "corr-granted",
		"extra":          3,
		"reason":         "three RPC failures in a row",
	})
	if got.status != 200 || got.code != "" {
		t.Fatalf("grant: %+v, want 200", got)
	}
	if got.correlationID != "corr-granted" || got.extra != 3 || got.grantedBy != ops || got.expiresAt == "" {
		t.Fatalf("grant response: %+v", got)
	}

	// The grant is in the chain-shaped record, under its own method.
	var grantRow *audit.Record
	for i := range log.records {
		if log.records[i].Method == audit.MethodResignAllowance {
			grantRow = &log.records[i]
		}
	}
	if grantRow == nil || grantRow.Caller != ops || grantRow.CorrelationID != "corr-granted" || grantRow.Outcome != audit.OutcomeAllowed {
		t.Fatalf("no resign-allowance record in the chain: %+v", log.records)
	}

	req := httptest.NewRequest("GET", "/resign-allowances/corr-granted", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("GET /resign-allowances/corr-granted: %d", resp.StatusCode)
	}
	var out struct {
		Extra     int    `json:"extra"`
		GrantedBy string `json:"granted_by"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if out.Extra != 3 || out.GrantedBy != ops {
		t.Fatalf("GET returned %+v", out)
	}
}

// Default deny: a caller outside resign_allowance.allowed_callers gets 403,
// and nothing is granted or recorded.
func TestGrantResignAllowanceRefusesAnUnauthorizedCaller(t *testing.T) {
	log := &memLog{}
	app := newAppAs(log, &fakeBackend{}, worker)

	got := grant(t, app, map[string]any{"correlation_id": "corr-x", "extra": 1})
	if got.status != 403 || got.code != "RESIGN_ALLOWANCE_FORBIDDEN" {
		t.Fatalf("grant by %q: %+v, want 403 RESIGN_ALLOWANCE_FORBIDDEN", worker, got)
	}
	if len(log.records) != 0 {
		t.Fatalf("a refused grant was recorded: %+v", log.records)
	}
}

// A second active grant for the same correlation is a 409, not a silent
// replacement: "what is the cap now" must never depend on which of two
// grants won.
func TestGrantResignAllowanceRefusesASecondActiveGrant(t *testing.T) {
	log := &memLog{}
	app := newAppAs(log, &fakeBackend{}, ops)

	if got := grant(t, app, map[string]any{"correlation_id": "corr-twice", "extra": 2}); got.status != 200 {
		t.Fatalf("first grant: %+v", got)
	}
	if got := grant(t, app, map[string]any{"correlation_id": "corr-twice", "extra": 5}); got.status != 409 || got.code != "RESIGN_ALLOWANCE_EXISTS" {
		t.Fatalf("second grant: %+v, want 409 RESIGN_ALLOWANCE_EXISTS", got)
	}
}

// The body cannot claim a grantor the certificate did not prove.
func TestGrantResignAllowanceRejectsAForeignGrantedBy(t *testing.T) {
	app := newAppAs(&memLog{}, &fakeBackend{}, ops)

	got := grant(t, app, map[string]any{
		"correlation_id": "corr-impersonated",
		"extra":          1,
		"granted_by":     "someone-else",
	})
	if got.status != 403 || got.code != "GRANTED_BY_MISMATCH" {
		t.Fatalf("grant claiming another grantor: %+v, want 403 GRANTED_BY_MISMATCH", got)
	}
}

// extra outside 1..10 is refused with the constraint's own numbers.
func TestGrantResignAllowanceValidatesExtra(t *testing.T) {
	app := newAppAs(&memLog{}, &fakeBackend{}, ops)

	for _, extra := range []int{0, 11, -1} {
		got := grant(t, app, map[string]any{"correlation_id": "corr-extra", "extra": extra})
		if got.status != 400 || got.code != "INVALID_EXTRA" {
			t.Fatalf("extra %d: %+v, want 400 INVALID_EXTRA", extra, got)
		}
	}
	if got := grant(t, app, map[string]any{"extra": 1}); got.status != 400 || got.code != "INVALID_CORRELATION_ID" {
		t.Fatalf("missing correlation id: %+v, want 400 INVALID_CORRELATION_ID", got)
	}
}

// GET for a correlation with no active allowance is a 404.
func TestGetResignAllowanceMissing(t *testing.T) {
	app := newAppAs(&memLog{}, &fakeBackend{}, ops)

	req := httptest.NewRequest("GET", "/resign-allowances/none", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 404 {
		t.Fatalf("GET for a missing allowance: %d, want 404", resp.StatusCode)
	}
}

// The expiry the handler stamps is the configured TTL from now — the
// allowance must be temporary, not a cap raise with extra steps.
func TestGrantResignAllowanceStampsExpiry(t *testing.T) {
	log := &memLog{}
	app := newAppAs(log, &fakeBackend{}, ops)

	before := time.Now().UTC()
	got := grant(t, app, map[string]any{"correlation_id": "corr-expiry", "extra": 1})
	after := time.Now().UTC()
	if got.status != 200 {
		t.Fatalf("grant: %+v", got)
	}
	expires, err := time.Parse(time.RFC3339, got.expiresAt)
	if err != nil {
		t.Fatalf("expires_at %q is not RFC3339: %v", got.expiresAt, err)
	}
	want := before.Add(24 * time.Hour)
	if expires.Before(want.Add(-time.Minute)) || expires.After(after.Add(24*time.Hour+time.Minute)) {
		t.Fatalf("expires_at %s, want about 24h after %s", expires, before)
	}
}
