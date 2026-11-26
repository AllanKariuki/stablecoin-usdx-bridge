package api

// H6 handler tests: POST /chain/enforcement broadcasts once per reference and
// answers 202 — never waiting for finality — and every later request for the
// same reference reads the stored state without resubmitting. Integration
// tests against a real Postgres (the dedupe is the chain_enforcements
// primary key), with the chain router faked — the same split as the
// break-glass and saga suites.
//
//	docker compose up -d postgres
//	LEDGER_TEST_DATABASE_URL='postgres://bridge:bridge@localhost:55433/bridge_test?sslmode=disable' \
//	  go test ./internal/api -run TestEnforcement -count=1

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/testdb"

	"github.com/gofiber/fiber/v2"
)

// fakeEnforcer implements both bridge.ChainClient and bridge.EnforcementClient
// so it can sit in a bridge.Router the way the real chain clients do. Every
// submission is recorded; every error is scripted.
type fakeEnforcer struct {
	mu sync.Mutex

	blacklists   []string // "address|reference"
	unblacklists []string
	pauses       []string
	unpauses     []string

	pauseAuthority    bool
	pauseAuthorityErr error
	submitErr         error // returned by all four submit methods; nil resets to success
	finalityFinal     bool
	finalityErr       error
	txSeq             int
}

func (f *fakeEnforcer) nextTx() string {
	f.txSeq++
	return fmt.Sprintf("0x%064x", f.txSeq)
}

func (f *fakeEnforcer) Blacklist(addr, reference string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.blacklists = append(f.blacklists, addr+"|"+reference)
	if f.submitErr != nil {
		return "", f.submitErr
	}
	return f.nextTx(), nil
}

func (f *fakeEnforcer) Unblacklist(addr, reference string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.unblacklists = append(f.unblacklists, addr+"|"+reference)
	if f.submitErr != nil {
		return "", f.submitErr
	}
	return f.nextTx(), nil
}

func (f *fakeEnforcer) Pause(reference string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.pauses = append(f.pauses, reference)
	if f.submitErr != nil {
		return "", f.submitErr
	}
	return f.nextTx(), nil
}

func (f *fakeEnforcer) Unpause(reference string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.unpauses = append(f.unpauses, reference)
	if f.submitErr != nil {
		return "", f.submitErr
	}
	return f.nextTx(), nil
}

func (f *fakeEnforcer) IsPauseAuthority(context.Context) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.pauseAuthority, f.pauseAuthorityErr
}

func (f *fakeEnforcer) FinalityStatus(string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.finalityFinal, f.finalityErr
}

func (f *fakeEnforcer) submits() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.blacklists) + len(f.unblacklists) + len(f.pauses) + len(f.unpauses)
}

// The rest of bridge.ChainClient: inert — the saga never runs in this suite.
func (f *fakeEnforcer) BridgeMint(string, *big.Int, string) (string, error) { return "0xmint", nil }
func (f *fakeEnforcer) BridgeBurn(string, *big.Int, string) (string, error) { return "0xburn", nil }
func (f *fakeEnforcer) WaitForFinality(string, string) error                { return nil }
func (f *fakeEnforcer) VerifyBurn(context.Context, string, string, *big.Int, string) error {
	return nil
}
func (f *fakeEnforcer) ValidTxHash(hash string) bool { return len(hash) == 66 && hash[:2] == "0x" }

type enforcementHarness struct {
	app   *fiber.App
	repo  *ledger.Repository
	svc   *ledger.Service
	chain *fakeEnforcer
	user  string
}

func newEnforcementHarness(t *testing.T) *enforcementHarness {
	t.Helper()
	dsn := testdb.DSN(t, "LEDGER_TEST_DATABASE_URL")
	apiOnce.Do(func() {
		apiRepo, apiErr = ledger.NewRepository(dsn)
		if apiErr == nil {
			apiErr = apiRepo.Bootstrap(context.Background(), ledger.DefaultCurrencies())
		}
	})
	if apiErr != nil {
		t.Fatalf("connecting: %v", apiErr)
	}

	svc := ledger.NewService(apiRepo, ledger.FeeSchedule{})
	chain := &fakeEnforcer{pauseAuthority: true}
	router := bridge.NewRouter(chain, chain)

	app := fiber.New(fiber.Config{DisableStartupMessage: true, ErrorHandler: platform.ErrorHandler})
	// The auth middleware itself is exercised in auth_test.go; the handler
	// tests run without it, exactly like the break-glass suite.
	NewHandlers(apiRepo, svc, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, router, nil, "").Register(app)

	return &enforcementHarness{
		app: app, repo: apiRepo, svc: svc, chain: chain,
		user: "enf-" + t.Name() + "-" + time.Now().UTC().Format("20060102150405.000000000"),
	}
}

func (h *enforcementHarness) do(t *testing.T, method, path string, body map[string]any, key string) (int, map[string]any) {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encoding request: %v", err)
	}
	req, err := http.NewRequest(method, path, bytes.NewReader(encoded))
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	// The shared test database persists idempotency rows across runs, so the
	// key is namespaced to this harness's user.
	req.Header.Set("Idempotency-Key", h.user+"|"+key)
	req.Header.Set("X-User-Id", "compliance@damp.local")
	resp, err := h.app.Test(req, 10_000)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("reading response: %v", err)
	}
	var parsed map[string]any
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &parsed)
	}
	return resp.StatusCode, parsed
}

func (h *enforcementHarness) post(t *testing.T, body map[string]any, key string) (int, map[string]any) {
	return h.do(t, http.MethodPost, "/chain/enforcement", body, key)
}

func (h *enforcementHarness) blacklistBody(reference string) map[string]any {
	return map[string]any{
		"action":    "BLACKLIST",
		"chain":     "ETHEREUM",
		"address":   "0x00000000000000000000000000000000000000E1",
		"reference": reference,
	}
}

// --- Validation -------------------------------------------------------------

func TestEnforcementValidates(t *testing.T) {
	h := newEnforcementHarness(t)
	target := "0x00000000000000000000000000000000000000E1"

	cases := []struct {
		name string
		body map[string]any
		want int
		code string
	}{
		{"unknown action", map[string]any{"action": "MINT", "chain": "ETHEREUM", "reference": "r"},
			fiber.StatusUnprocessableEntity, "UNKNOWN_ACTION"},
		{"missing reference", map[string]any{"action": "PAUSE", "chain": "ETHEREUM"},
			fiber.StatusBadRequest, "INVALID_REQUEST"},
		{"blacklist without address", map[string]any{"action": "BLACKLIST", "chain": "ETHEREUM", "reference": "r"},
			fiber.StatusBadRequest, "INVALID_REQUEST"},
		{"blacklist with invalid address", map[string]any{"action": "BLACKLIST", "chain": "ETHEREUM", "address": "not-an-address", "reference": "r"},
			fiber.StatusBadRequest, "INVALID_REQUEST"},
		{"solana blacklist", map[string]any{"action": "BLACKLIST", "chain": "SOLANA", "address": target, "reference": "r"},
			fiber.StatusUnprocessableEntity, "UNSUPPORTED_ON_CHAIN"},
		{"solana unblacklist", map[string]any{"action": "UNBLACKLIST", "chain": "SOLANA", "address": target, "reference": "r"},
			fiber.StatusUnprocessableEntity, "UNSUPPORTED_ON_CHAIN"},
		{"unknown chain", map[string]any{"action": "PAUSE", "chain": "POLYGON", "reference": "r"},
			fiber.StatusUnprocessableEntity, "UNSUPPORTED_ON_CHAIN"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, body := h.post(t, tc.body, tc.name)
			if status != tc.want {
				t.Fatalf("status = %d, want %d (body %v)", status, tc.want, body)
			}
			if body["code"] != tc.code {
				t.Fatalf("code = %v, want %s (body %v)", body["code"], tc.code, body)
			}
		})
	}
	if h.chain.submits() != 0 {
		t.Fatalf("a validation failure still submitted %d transactions", h.chain.submits())
	}
}

func TestEnforcementRefusesANonAdminPause(t *testing.T) {
	h := newEnforcementHarness(t)
	h.chain.mu.Lock()
	h.chain.pauseAuthority = false
	h.chain.mu.Unlock()

	for _, action := range []string{"PAUSE", "UNPAUSE"} {
		status, body := h.post(t, map[string]any{"action": action, "chain": "SOLANA", "reference": "r"}, "nonadmin-"+action)
		if status != fiber.StatusUnprocessableEntity || body["code"] != "NOT_CHAIN_ADMIN" {
			t.Fatalf("%s: status %d body %v, want 422 NOT_CHAIN_ADMIN", action, status, body)
		}
	}
	if h.chain.submits() != 0 {
		t.Fatalf("a non-admin pause still submitted; nothing may be sent")
	}
}

func TestEnforcementFailsClosedWhenAuthorityIsUnknown(t *testing.T) {
	h := newEnforcementHarness(t)
	h.chain.mu.Lock()
	h.chain.pauseAuthorityErr = context.DeadlineExceeded
	h.chain.mu.Unlock()

	status, body := h.post(t, map[string]any{"action": "PAUSE", "chain": "ETHEREUM", "reference": "r"}, "auth-unknown")
	if status != fiber.StatusBadGateway || body["code"] != "CHAIN_UNAVAILABLE" {
		t.Fatalf("status %d body %v, want 502 CHAIN_UNAVAILABLE", status, body)
	}
}

// --- Submission (the dedupe is the point) -----------------------------------

func TestEnforcementSubmitsOnceAndReturnsAccepted(t *testing.T) {
	h := newEnforcementHarness(t)
	ref := h.user + ":action"

	status, body := h.post(t, h.blacklistBody(ref), "submit-1")
	if status != fiber.StatusAccepted {
		t.Fatalf("status = %d, want 202 (body %v)", status, body)
	}
	if body["status"] != "SUBMITTED" || body["tx_hash"] == "" || body["reference"] != ref {
		t.Fatalf("body = %v, want 202 SUBMITTED + tx_hash + reference", body)
	}
	if h.chain.submits() != 1 {
		t.Fatalf("submissions = %d, want 1", h.chain.submits())
	}

	// The stored row is the dedupe: a retried request answers from it and
	// submits NOTHING.
	status2, body2 := h.post(t, h.blacklistBody(ref), "submit-2")
	if status2 != fiber.StatusAccepted || body2["status"] != "SUBMITTED" || body2["tx_hash"] != body["tx_hash"] {
		t.Fatalf("retry: status %d body %v, want the stored SUBMITTED state", status2, body2)
	}
	if h.chain.submits() != 1 {
		t.Fatalf("submissions after retry = %d; a known reference must never resubmit", h.chain.submits())
	}
}

func TestEnforcementAuditsTheSubmission(t *testing.T) {
	h := newEnforcementHarness(t)
	ref := h.user + ":audit"

	if status, body := h.post(t, h.blacklistBody(ref), "audit-1"); status != fiber.StatusAccepted {
		t.Fatalf("status = %d body %v", status, body)
	}

	db, err := sql.Open("pgx", testdb.DSN(t, "LEDGER_TEST_DATABASE_URL"))
	if err != nil {
		t.Fatalf("opening db: %v", err)
	}
	defer db.Close()
	var actor string
	err = db.QueryRow(`
		SELECT payload->>'actor' FROM audit_outbox
		 WHERE action = 'ledger.chain.enforcement_submitted' AND payload->>'subject_id' = $1`, ref).Scan(&actor)
	if err != nil {
		t.Fatalf("audit row: %v", err)
	}
	if actor != "compliance@damp.local" {
		t.Fatalf("actor = %q, want X-User-Id", actor)
	}
}

func TestEnforcementTerminalSubmitFailureMarksFailed(t *testing.T) {
	h := newEnforcementHarness(t)
	ref := h.user + ":terminal"
	h.chain.mu.Lock()
	h.chain.submitErr = fmt.Errorf("blacklist tx: execution reverted: %w", bridge.ErrTxFailedOnChain)
	h.chain.mu.Unlock()

	status, body := h.post(t, h.blacklistBody(ref), "terminal-1")
	if status != fiber.StatusConflict || body["code"] != "CHAIN_REJECTED" {
		t.Fatalf("status %d body %v, want 409 CHAIN_REJECTED", status, body)
	}

	row, err := h.repo.ChainEnforcementByReference(context.Background(), ref)
	if err != nil {
		t.Fatalf("row: %v", err)
	}
	if row.Status != "FAILED" || !strings.Contains(row.FailureReason, "reverted") {
		t.Fatalf("row = %+v, want FAILED with the chain's reason", row)
	}

	// A retry reads the FAILED state; it does not submit again.
	h.chain.mu.Lock()
	h.chain.submitErr = nil
	h.chain.mu.Unlock()
	status2, body2 := h.post(t, h.blacklistBody(ref), "terminal-2")
	if status2 != http.StatusOK || body2["status"] != "FAILED" {
		t.Fatalf("retry: status %d body %v, want 200 FAILED from the row", status2, body2)
	}
	if h.chain.submits() != 1 {
		t.Fatalf("submissions = %d; a FAILED reference must not resubmit", h.chain.submits())
	}
}

func TestEnforcementTransientSubmitFailureAllowsARetry(t *testing.T) {
	h := newEnforcementHarness(t)
	ref := h.user + ":transient"
	h.chain.mu.Lock()
	h.chain.submitErr = context.DeadlineExceeded
	h.chain.mu.Unlock()

	// No hash was ever obtained, so the row is released: a retry resubmits.
	status, body := h.post(t, h.blacklistBody(ref), "transient-1")
	if status != fiber.StatusBadGateway || body["code"] != "CHAIN_UNAVAILABLE" {
		t.Fatalf("status %d body %v, want 502 CHAIN_UNAVAILABLE", status, body)
	}
	if _, err := h.repo.ChainEnforcementByReference(context.Background(), ref); err == nil {
		t.Fatalf("the row survived a transient no-hash failure; it must be released for retry")
	}

	h.chain.mu.Lock()
	h.chain.submitErr = nil
	h.chain.mu.Unlock()
	status2, body2 := h.post(t, h.blacklistBody(ref), "transient-2")
	if status2 != fiber.StatusAccepted || body2["status"] != "SUBMITTED" {
		t.Fatalf("retry: status %d body %v, want 202 SUBMITTED", status2, body2)
	}
	if h.chain.submits() != 2 {
		t.Fatalf("submissions = %d, want 2 (the failed attempt and the retry)", h.chain.submits())
	}
}

func TestEnforcementStaleHashlessRowIsFailedNotResubmitted(t *testing.T) {
	h := newEnforcementHarness(t)
	ref := h.user + ":stale"

	// Simulate a submission cut off between broadcasting and recording the
	// hash: a SUBMITTED row, no hash, old enough to have aged out.
	if err := h.repo.CreateChainEnforcement(context.Background(), &ledger.ChainEnforcement{
		Reference:   ref,
		Action:      "BLACKLIST",
		Chain:       "ETHEREUM",
		Address:     "0x00000000000000000000000000000000000000E1",
		Status:      string(ledger.EnforcementSubmitted),
		CreatedAt:   time.Now().UTC().Add(-2 * time.Minute),
		UpdatedAt:   time.Now().UTC().Add(-2 * time.Minute),
		NextCheckAt: time.Now().UTC(),
	}); err != nil {
		t.Fatalf("seeding: %v", err)
	}

	status, body := h.post(t, h.blacklistBody(ref), "stale-1")
	if status != http.StatusOK || body["status"] != "FAILED" {
		t.Fatalf("status %d body %v, want 200 FAILED (unknown outcome)", status, body)
	}
	if body["failure_reason"] == "" {
		t.Fatalf("a stale hashless row must carry a reason that sends a human to the chain: %v", body)
	}
	if h.chain.submits() != 0 {
		t.Fatalf("a stale row was resubmitted; a reference that may have a transaction in flight must never be")
	}
}

func TestEnforcementRendersFinalAndFailedRows(t *testing.T) {
	h := newEnforcementHarness(t)
	finalRef := h.user + ":final"
	failedRef := h.user + ":failed"

	if status, body := h.post(t, h.blacklistBody(finalRef), "render-1"); status != fiber.StatusAccepted {
		t.Fatalf("status %d body %v", status, body)
	}
	if err := h.repo.FinalizeChainEnforcement(context.Background(), finalRef, true, ""); err != nil {
		t.Fatalf("finalizing: %v", err)
	}
	if err := h.repo.CreateChainEnforcement(context.Background(), &ledger.ChainEnforcement{
		Reference: failedRef, Action: "PAUSE", Chain: "ETHEREUM", Status: "FAILED", FailureReason: "the chain refused",
	}); err != nil {
		t.Fatalf("seeding FAILED row: %v", err)
	}

	status, body := h.post(t, h.blacklistBody(finalRef), "render-2")
	if status != http.StatusOK || body["status"] != "FINAL" {
		t.Fatalf("FINAL row: status %d body %v, want 200 FINAL", status, body)
	}
	status, body = h.post(t, map[string]any{"action": "PAUSE", "chain": "ETHEREUM", "reference": failedRef}, "render-3")
	if status != http.StatusOK || body["status"] != "FAILED" || body["failure_reason"] != "the chain refused" {
		t.Fatalf("FAILED row: status %d body %v", status, body)
	}
	if h.chain.submits() != 1 {
		t.Fatalf("rendering stored rows submitted %d transactions", h.chain.submits())
	}
}

// --- GET --------------------------------------------------------------------

func TestEnforcementGetReturnsTheStoredState(t *testing.T) {
	h := newEnforcementHarness(t)
	ref := h.user + ":get"

	if status, body := h.post(t, h.blacklistBody(ref), "get-1"); status != fiber.StatusAccepted {
		t.Fatalf("status %d body %v", status, body)
	}

	status, body := h.do(t, http.MethodGet, "/chain/enforcement/"+ref, nil, "get-2")
	if status != http.StatusOK || body["status"] != "SUBMITTED" || body["tx_hash"] == "" {
		t.Fatalf("status %d body %v, want the stored row", status, body)
	}

	status, body = h.do(t, http.MethodGet, "/chain/enforcement/"+h.user+":never", nil, "get-3")
	if status != http.StatusNotFound {
		t.Fatalf("unknown reference: status %d body %v, want 404", status, body)
	}
}
