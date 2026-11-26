package api

// H4 handler tests: the break-glass confirm proposes and does not settle; the
// workflow callback proves the burn before anything moves. Integration tests
// against a real Postgres (the uniqueness and idempotency guarantees live in
// indexes), with services/workflow and the chain router faked — the same
// split as the saga suite.
//
//	docker compose up -d postgres
//	LEDGER_TEST_DATABASE_URL='postgres://bridge:bridge@localhost:55433/bridge_test?sslmode=disable' \
//	  go test ./internal/api -run TestBreakGlass -count=1

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
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
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/workflowclient"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/testdb"

	"github.com/gofiber/fiber/v2"
)

// fakeWorkflow stands in for services/workflow: it records what was proposed
// and hands back a request id, or the error the test wants. The prefix
// namespaces ids to the harness, because the shared test database keeps
// every row ever written and workflow request ids are the callback's key.
type fakeWorkflow struct {
	mu        sync.Mutex
	prefix    string
	proposals []workflowclient.ProposeInput
	err       error
}

func (f *fakeWorkflow) Propose(_ context.Context, in workflowclient.ProposeInput) (*workflowclient.ProposedRequest, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return nil, f.err
	}
	f.proposals = append(f.proposals, in)
	return &workflowclient.ProposedRequest{
		ID:            fmt.Sprintf("%s-req_%d", f.prefix, len(f.proposals)),
		Status:        "PENDING",
		PayloadDigest: workflowclient.Digest(in.Payload),
	}, nil
}

func (f *fakeWorkflow) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.proposals)
}

// fakeVerifyChain implements bridge.ChainClient: the burn verification is
// scripted, everything else is inert (the saga never runs here).
type fakeVerifyChain struct {
	mu         sync.Mutex
	verifyErr  error
	verifyCall []string
}

func (f *fakeVerifyChain) BridgeMint(string, *big.Int, string) (string, error) { return "0xmint", nil }
func (f *fakeVerifyChain) BridgeBurn(string, *big.Int, string) (string, error) { return "0xburn", nil }
func (f *fakeVerifyChain) WaitForFinality(string, string) error                { return nil }
func (f *fakeVerifyChain) VerifyBurn(_ context.Context, txHash, from string, _ *big.Int, _ string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.verifyCall = append(f.verifyCall, txHash+"|"+from)
	return f.verifyErr
}
func (f *fakeVerifyChain) ValidTxHash(hash string) bool {
	return len(hash) == 66 && strings.HasPrefix(hash, "0x")
}

type breakGlassHarness struct {
	app      *fiber.App
	repo     *ledger.Repository
	svc      *ledger.Service
	ctx      context.Context
	workflow *fakeWorkflow
	chain    *fakeVerifyChain
	secret   string

	user          string
	usd           *ledger.Wallet
	usdxEth       *ledger.Wallet
	redeemTx      *ledger.Transaction
	correlationID string
	sourceAddress string
	amount        *big.Int
	txHash        string
}

func newBreakGlassHarness(t *testing.T) *breakGlassHarness {
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

	ctx := context.Background()
	svc := ledger.NewService(apiRepo, ledger.FeeSchedule{})
	chain := &fakeVerifyChain{}
	router := bridge.NewRouter(chain, chain)

	app := fiber.New(fiber.Config{DisableStartupMessage: true, ErrorHandler: platform.ErrorHandler})

	h := &breakGlassHarness{
		app: app, repo: apiRepo, svc: svc, ctx: ctx,
		chain: chain, secret: "test-callback-secret",
		user:          "bg-" + t.Name() + "-" + time.Now().UTC().Format("20060102150405.000000000"),
		sourceAddress: "0x00000000000000000000000000000000000000E1",
		amount:        big.NewInt(100_000000), // 100.000000 USD-X
		txHash:        "0x" + strings.Repeat("a", 64),
	}
	h.workflow = &fakeWorkflow{prefix: h.user}
	NewHandlers(apiRepo, svc, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, router, h.workflow, h.secret).Register(app)

	h.usd = h.wallet(t, "USD", "", "")
	h.usdxEth = h.wallet(t, "USDX", "ETHEREUM", h.sourceAddress)

	// Fund the fiat wallet and put USD-X in the chain wallet the way the
	// platform really does, then open a redemption whose saga is PENDING —
	// the state break-glass exists for.
	if _, err := svc.Deposit(ctx, ledger.DepositRequest{
		WalletID: h.usd.ID, Amount: big.NewInt(1000_00),
		IdempotencyKey: h.user + ":seed-deposit", BankRef: "SEED",
	}); err != nil {
		t.Fatalf("seed deposit: %v", err)
	}
	if _, err := svc.Issue(ctx, ledger.IssueRequest{
		FiatWalletID: h.usd.ID, USDXWalletID: h.usdxEth.ID, Amount: big.NewInt(500_00),
		IdempotencyKey: h.user + ":seed-issue", CorrelationID: h.user + ":seed-corr",
	}); err != nil {
		t.Fatalf("seed issuance: %v", err)
	}
	if _, err := svc.ConfirmUSDXCredit(ctx, h.usdxEth.ID, big.NewInt(500_000000), h.user+":seed-corr", "0xseed"); err != nil {
		t.Fatalf("seed usdx credit: %v", err)
	}

	h.correlationID = h.user + ":redeem-corr"
	redeemTx, err := svc.Redeem(ctx, ledger.RedeemRequest{
		USDXWalletID:   h.usdxEth.ID,
		FiatWalletID:   h.usd.ID,
		Amount:         h.amount,
		CorrelationID:  h.correlationID,
		IdempotencyKey: h.user + ":redeem",
	})
	if err != nil {
		t.Fatalf("Redeem: %v", err)
	}
	h.redeemTx = redeemTx
	if _, err := h.repo.UpsertTransfer(ctx, &ledger.BridgeTransfer{
		CorrelationID:  h.correlationID,
		Kind:           ledger.SagaRedeem,
		SourceAddress:  h.sourceAddress,
		Amount:         h.amount,
		SourceChain:    h.usdxEth.Chain,
		TargetChain:    "",
		Status:         ledger.StatusPending,
		UserID:         h.user,
		SourceWalletID: h.usdxEth.ID,
		LedgerTxID:     redeemTx.ID,
	}); err != nil {
		t.Fatalf("UpsertTransfer: %v", err)
	}
	return h
}

func (h *breakGlassHarness) wallet(t *testing.T, currency, chain, address string) *ledger.Wallet {
	t.Helper()
	w, err := h.repo.EnsureWallet(h.ctx, h.user, currency, chain, address, currency, "test")
	if err != nil {
		t.Fatalf("EnsureWallet %s/%s: %v", currency, chain, err)
	}
	return w
}

func (h *breakGlassHarness) balance(t *testing.T, accountID string) string {
	t.Helper()
	bal, err := h.repo.Balance(h.ctx, accountID)
	if err != nil {
		t.Fatalf("balance: %v", err)
	}
	return bal.String()
}

func (h *breakGlassHarness) sagaStatus(t *testing.T) ledger.TransferStatus {
	t.Helper()
	tr, err := h.repo.FindByCorrelationID(h.correlationID)
	if err != nil {
		t.Fatalf("loading transfer: %v", err)
	}
	return tr.Status
}

// signCallback computes workflow's HMAC the way services/workflow does.
func signCallback(secret, requestID, subjectType, subjectID, payloadDigest, status string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strings.Join([]string{requestID, subjectType, subjectID, payloadDigest, status}, "\n")))
	return hex.EncodeToString(mac.Sum(nil))
}

// wfReqID is the request id the harness's fakeWorkflow will hand out for
// proposal n — namespaced to this harness, so nothing collides with rows a
// previous test run left in the shared database.
func (h *breakGlassHarness) wfReqID(n int) string {
	return fmt.Sprintf("%s-req_%d", h.user, n)
}

func (h *breakGlassHarness) confirm(t *testing.T, hash, reason, key string) (int, map[string]any) {
	t.Helper()
	return h.do(t, "POST", "/redemptions/"+h.redeemTx.ID+"/confirm", map[string]any{
		"chain_tx_hash": hash,
		"reason":        reason,
	}, map[string]string{
		// The shared test database persists idempotency rows across runs, so
		// the key is namespaced to this harness's user.
		"Idempotency-Key": h.user + "|" + key,
		"X-User-Id":       "treasury@damp.local",
	})
}

func (h *breakGlassHarness) callback(t *testing.T, body map[string]any, signature string) (int, map[string]any) {
	t.Helper()
	headers := map[string]string{}
	if signature != "" {
		headers[workflowclient.SignatureHeader] = signature
	}
	return h.do(t, "POST", workflowclient.CallbackPath(), body, headers)
}

func (h *breakGlassHarness) do(t *testing.T, method, path string, payload any, headers map[string]string) (int, map[string]any) {
	t.Helper()
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("encoding request: %v", err)
	}
	req, err := http.NewRequest(method, path, bytes.NewReader(encoded))
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := h.app.Test(req, 10_000)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("reading response: %v", err)
	}
	var parsed map[string]any
	if len(body) > 0 {
		_ = json.Unmarshal(body, &parsed)
	}
	return resp.StatusCode, parsed
}

func (h *breakGlassHarness) digestFor(t *testing.T, hash, reason string) string {
	t.Helper()
	tr, err := h.repo.TransferForLedgerTx(h.ctx, h.redeemTx.ID)
	if err != nil {
		t.Fatalf("loading transfer: %v", err)
	}
	return workflowclient.Digest(breakGlassPayload(tr, hash, reason))
}

// --- The confirm route -------------------------------------------------------

func TestBreakGlassConfirmProposesAndDoesNotSettle(t *testing.T) {
	h := newBreakGlassHarness(t)
	fiatBefore := h.balance(t, h.usd.AccountID)

	status, body := h.confirm(t, h.txHash, "the worker lost the receipt", "bg-confirm-1")
	if status != http.StatusAccepted {
		t.Fatalf("status = %d, body = %v", status, body)
	}
	if body["status"] != "PENDING_APPROVAL" || body["approval_request_id"] == "" {
		t.Fatalf("body = %v, want PENDING_APPROVAL + approval_request_id", body)
	}

	// It proposed — with the operator's identity, the saga's chain values,
	// and the payload the digest will be re-derived from.
	if got := h.workflow.count(); got != 1 {
		t.Fatalf("workflow proposals = %d, want 1", got)
	}
	h.workflow.mu.Lock()
	proposal := h.workflow.proposals[0]
	h.workflow.mu.Unlock()
	if proposal.Action != "redemption.break_glass" || proposal.SubjectType != "REDEMPTION" || proposal.SubjectID != h.redeemTx.ID {
		t.Fatalf("proposal = %+v", proposal)
	}
	if proposal.RequestedBy != "treasury@damp.local" {
		t.Fatalf("requestedBy = %q, want the operator", proposal.RequestedBy)
	}
	if proposal.Payload["correlation_id"] != h.correlationID || proposal.Payload["chain"] != "ETHEREUM" || proposal.Payload["amount"] != "100.000000" {
		t.Fatalf("payload = %v", proposal.Payload)
	}

	// It did not settle: no fiat moved, the saga is untouched.
	if got := h.sagaStatus(t); got != ledger.StatusPending {
		t.Fatalf("saga = %s, want PENDING", got)
	}
	if got := h.balance(t, h.usd.AccountID); got != fiatBefore {
		t.Fatalf("fiat moved from %s to %s; nothing may move before approval and verification", fiatBefore, got)
	}

	// The proposal row is there and pollable.
	row, err := h.repo.LatestBreakGlass(h.ctx, h.redeemTx.ID)
	if err != nil {
		t.Fatalf("break-glass row: %v", err)
	}
	if row.Status != string(ledger.BreakGlassPending) || row.WorkflowRequestID != h.wfReqID(1) {
		t.Fatalf("row = %+v", row)
	}

	// A second confirm while one is pending is a double-submit.
	status2, body2 := h.confirm(t, h.txHash, "again", "bg-confirm-2")
	if status2 != http.StatusConflict || body2["code"] != "BREAK_GLASS_PENDING" {
		t.Fatalf("second confirm: status %d body %v, want 409 BREAK_GLASS_PENDING", status2, body2)
	}
}

func TestBreakGlassConfirmRejectsASettledSaga(t *testing.T) {
	h := newBreakGlassHarness(t)
	if err := h.repo.SettleTransfer(h.ctx, h.correlationID, ledger.StatusCompleted, ""); err != nil {
		t.Fatalf("settling: %v", err)
	}

	status, body := h.confirm(t, h.txHash, "late", "bg-settled-1")
	if status != http.StatusConflict || body["code"] != "SAGA_ALREADY_SETTLED" {
		t.Fatalf("status %d body %v, want 409 SAGA_ALREADY_SETTLED", status, body)
	}
	if got := h.workflow.count(); got != 0 {
		t.Fatalf("workflow proposals = %d, want 0", got)
	}
}

func TestBreakGlassConfirmRejectsABadHash(t *testing.T) {
	h := newBreakGlassHarness(t)
	for _, hash := range []string{"0x1234", "not-a-hash", ""} {
		status, body := h.confirm(t, hash, "typed by hand", "bg-badhash-"+hash)
		if status != http.StatusBadRequest {
			t.Fatalf("hash %q: status %d body %v, want 400", hash, status, body)
		}
	}
	if got := h.workflow.count(); got != 0 {
		t.Fatalf("workflow proposals = %d, want 0", got)
	}
}

func TestBreakGlassConfirmRefusesWhenWorkflowIsDown(t *testing.T) {
	h := newBreakGlassHarness(t)
	h.workflow.mu.Lock()
	h.workflow.err = context.DeadlineExceeded
	h.workflow.mu.Unlock()

	status, body := h.confirm(t, h.txHash, "urgent", "bg-wf-down-1")
	if status != http.StatusBadGateway || body["code"] != "WORKFLOW_UNAVAILABLE" {
		t.Fatalf("status %d body %v, want 502 WORKFLOW_UNAVAILABLE", status, body)
	}
	if got := h.sagaStatus(t); got != ledger.StatusPending {
		t.Fatalf("saga = %s, want PENDING", got)
	}
}

// --- The callback route ------------------------------------------------------

func TestBreakGlassCallbackRejectsABadSignature(t *testing.T) {
	h := newBreakGlassHarness(t)
	if _, body := h.confirm(t, h.txHash, "why", "bg-sig-1"); body["approval_request_id"] == "" {
		t.Fatalf("confirm did not propose: %v", body)
	}
	digest := h.digestFor(t, h.txHash, "why")
	cb := map[string]any{
		"requestId": h.wfReqID(1), "subjectType": "REDEMPTION", "subjectId": h.redeemTx.ID,
		"payloadDigest": digest, "status": "APPROVED",
	}

	status, _ := h.callback(t, cb, "")
	if status != http.StatusUnauthorized {
		t.Fatalf("unsigned callback: status %d, want 401", status)
	}
	status, _ = h.callback(t, cb, signCallback("wrong-secret", h.wfReqID(1), "REDEMPTION", h.redeemTx.ID, digest, "APPROVED"))
	if status != http.StatusUnauthorized {
		t.Fatalf("wrong-secret callback: status %d, want 401", status)
	}
}

func TestBreakGlassCallbackApprovedSettlesExactlyOnce(t *testing.T) {
	h := newBreakGlassHarness(t)
	fiatBefore := h.balance(t, h.usd.AccountID)

	if _, body := h.confirm(t, h.txHash, "worker died mid-burn", "bg-settle-1"); body["approval_request_id"] == "" {
		t.Fatalf("confirm did not propose: %v", body)
	}

	digest := h.digestFor(t, h.txHash, "worker died mid-burn")
	sig := signCallback(h.secret, h.wfReqID(1), "REDEMPTION", h.redeemTx.ID, digest, "APPROVED")
	status, body := h.callback(t, map[string]any{
		"requestId": h.wfReqID(1), "subjectType": "REDEMPTION", "subjectId": h.redeemTx.ID,
		"payloadDigest": digest, "status": "APPROVED",
	}, sig)
	if status != http.StatusOK || body["applied"] != true {
		t.Fatalf("status %d body %v, want applied", status, body)
	}

	// The burn was asked to verify with exactly the saga's values.
	h.chain.mu.Lock()
	calls := append([]string(nil), h.chain.verifyCall...)
	h.chain.mu.Unlock()
	if len(calls) != 1 || calls[0] != h.txHash+"|"+h.sourceAddress {
		t.Fatalf("VerifyBurn calls = %v", calls)
	}

	// Settled: saga COMPLETED, the fiat released, the row APPROVED_VERIFIED.
	if got := h.sagaStatus(t); got != ledger.StatusCompleted {
		t.Fatalf("saga = %s, want COMPLETED", got)
	}
	if got := h.balance(t, h.usd.AccountID); got == fiatBefore {
		t.Fatalf("fiat did not move; the approved and verified redemption must release it")
	}
	row, err := h.repo.LatestBreakGlass(h.ctx, h.redeemTx.ID)
	if err != nil || row.Status != string(ledger.BreakGlassApprovedVerified) {
		t.Fatalf("row = %+v (err %v), want APPROVED_VERIFIED", row, err)
	}

	// Redelivery (workflow retries callbacks) settles nothing a second time.
	status, body = h.callback(t, map[string]any{
		"requestId": h.wfReqID(1), "subjectType": "REDEMPTION", "subjectId": h.redeemTx.ID,
		"payloadDigest": digest, "status": "APPROVED",
	}, sig)
	if status != http.StatusOK || body["applied"] != false {
		t.Fatalf("redelivery: status %d body %v, want applied=false", status, body)
	}
	fiatAfter := h.balance(t, h.usd.AccountID)
	h.chain.mu.Lock()
	verifyCalls := len(h.chain.verifyCall)
	h.chain.mu.Unlock()
	if verifyCalls != 1 {
		t.Fatalf("VerifyBurn ran %d times; a redelivered callback must not re-settle", verifyCalls)
	}
	if got := h.balance(t, h.usd.AccountID); got != fiatAfter {
		t.Fatalf("fiat moved on redelivery from %s to %s", fiatAfter, got)
	}
}

func TestBreakGlassCallbackMismatchedBurnDoesNotSettle(t *testing.T) {
	h := newBreakGlassHarness(t)
	fiatBefore := h.balance(t, h.usd.AccountID)

	if _, body := h.confirm(t, h.txHash, "wrong hash, it turns out", "bg-mismatch-1"); body["approval_request_id"] == "" {
		t.Fatalf("confirm did not propose: %v", body)
	}
	h.chain.mu.Lock()
	h.chain.verifyErr = &bridge.ErrBurnMismatch{Field: "amount"}
	h.chain.mu.Unlock()

	digest := h.digestFor(t, h.txHash, "wrong hash, it turns out")
	sig := signCallback(h.secret, h.wfReqID(1), "REDEMPTION", h.redeemTx.ID, digest, "APPROVED")
	status, body := h.callback(t, map[string]any{
		"requestId": h.wfReqID(1), "subjectType": "REDEMPTION", "subjectId": h.redeemTx.ID,
		"payloadDigest": digest, "status": "APPROVED",
	}, sig)
	if status != http.StatusOK || body["applied"] != false {
		t.Fatalf("status %d body %v", status, body)
	}

	// The approval did not move money: saga untouched, fiat untouched.
	if got := h.sagaStatus(t); got != ledger.StatusPending {
		t.Fatalf("saga = %s, want PENDING", got)
	}
	if got := h.balance(t, h.usd.AccountID); got != fiatBefore {
		t.Fatalf("fiat moved from %s to %s on a failed verification", fiatBefore, got)
	}
	row, err := h.repo.LatestBreakGlass(h.ctx, h.redeemTx.ID)
	if err != nil || row.Status != string(ledger.BreakGlassVerificationFailed) {
		t.Fatalf("row = %+v (err %v), want VERIFICATION_FAILED", row, err)
	}
	if !strings.Contains(row.FailureReason, "amount") {
		t.Fatalf("failure_reason = %q, want the typed field named", row.FailureReason)
	}

	// A rejected proposal leaves the partial index free: the operator can
	// propose again with the right hash.
	if _, body := h.confirm(t, h.txHash, "try again", "bg-mismatch-2"); body["approval_request_id"] == "" {
		t.Fatalf("re-propose after VERIFICATION_FAILED: %v", body)
	}
}

func TestBreakGlassCallbackRejected(t *testing.T) {
	h := newBreakGlassHarness(t)
	fiatBefore := h.balance(t, h.usd.AccountID)

	if _, body := h.confirm(t, h.txHash, "maybe not", "bg-reject-1"); body["approval_request_id"] == "" {
		t.Fatalf("confirm did not propose: %v", body)
	}

	digest := h.digestFor(t, h.txHash, "maybe not")
	sig := signCallback(h.secret, h.wfReqID(1), "REDEMPTION", h.redeemTx.ID, digest, "REJECTED")
	status, body := h.callback(t, map[string]any{
		"requestId": h.wfReqID(1), "subjectType": "REDEMPTION", "subjectId": h.redeemTx.ID,
		"payloadDigest": digest, "status": "REJECTED",
	}, sig)
	if status != http.StatusOK || body["applied"] != true || body["status"] != "REJECTED" {
		t.Fatalf("status %d body %v", status, body)
	}

	row, err := h.repo.LatestBreakGlass(h.ctx, h.redeemTx.ID)
	if err != nil || row.Status != string(ledger.BreakGlassRejected) {
		t.Fatalf("row = %+v (err %v), want REJECTED", row, err)
	}
	if got := h.sagaStatus(t); got != ledger.StatusPending {
		t.Fatalf("saga = %s, want PENDING", got)
	}
	if got := h.balance(t, h.usd.AccountID); got != fiatBefore {
		t.Fatalf("fiat moved on a rejection")
	}
	h.chain.mu.Lock()
	calls := len(h.chain.verifyCall)
	h.chain.mu.Unlock()
	if calls != 0 {
		t.Fatalf("VerifyBurn ran %d times on a rejection", calls)
	}
}

func TestBreakGlassCallbackRefusesADigestMismatch(t *testing.T) {
	h := newBreakGlassHarness(t)
	fiatBefore := h.balance(t, h.usd.AccountID)

	if _, body := h.confirm(t, h.txHash, "original", "bg-digest-1"); body["approval_request_id"] == "" {
		t.Fatalf("confirm did not propose: %v", body)
	}

	// The HMAC is genuine — workflow really signed it — but over a payload
	// this ledger did not propose. A compromised workflow service is exactly
	// what this check must stop.
	tampered := "sha256:" + strings.Repeat("0", 64)
	sig := signCallback(h.secret, h.wfReqID(1), "REDEMPTION", h.redeemTx.ID, tampered, "APPROVED")
	status, body := h.callback(t, map[string]any{
		"requestId": h.wfReqID(1), "subjectType": "REDEMPTION", "subjectId": h.redeemTx.ID,
		"payloadDigest": tampered, "status": "APPROVED",
	}, sig)
	if status != http.StatusOK || body["applied"] != false {
		t.Fatalf("status %d body %v", status, body)
	}
	if got := h.sagaStatus(t); got != ledger.StatusPending {
		t.Fatalf("saga = %s, want PENDING", got)
	}
	if got := h.balance(t, h.usd.AccountID); got != fiatBefore {
		t.Fatalf("fiat moved on a digest mismatch")
	}
	row, err := h.repo.LatestBreakGlass(h.ctx, h.redeemTx.ID)
	if err != nil || row.Status != string(ledger.BreakGlassVerificationFailed) {
		t.Fatalf("row = %+v (err %v), want VERIFICATION_FAILED", row, err)
	}
}

func TestBreakGlassCallbackIgnoresUnknownRequests(t *testing.T) {
	h := newBreakGlassHarness(t)
	digest := "sha256:" + strings.Repeat("1", 64)
	sig := signCallback(h.secret, h.wfReqID(404), "REDEMPTION", h.redeemTx.ID, digest, "APPROVED")
	status, body := h.callback(t, map[string]any{
		"requestId": h.wfReqID(404), "subjectType": "REDEMPTION", "subjectId": h.redeemTx.ID,
		"payloadDigest": digest, "status": "APPROVED",
	}, sig)
	if status != http.StatusOK || body["applied"] != false {
		t.Fatalf("status %d body %v, want applied=false", status, body)
	}
}

// --- The status route --------------------------------------------------------

func TestBreakGlassStatus(t *testing.T) {
	h := newBreakGlassHarness(t)
	status, body := h.do(t, "GET", "/redemptions/"+h.redeemTx.ID+"/break-glass", nil, nil)
	if status != http.StatusNotFound {
		t.Fatalf("before a proposal: status %d, want 404", status)
	}

	if _, resp := h.confirm(t, h.txHash, "for the console", "bg-status-1"); resp["approval_request_id"] == "" {
		t.Fatalf("confirm did not propose: %v", resp)
	}

	status, body = h.do(t, "GET", "/redemptions/"+h.redeemTx.ID+"/break-glass", nil, nil)
	if status != http.StatusOK {
		t.Fatalf("status %d body %v", status, body)
	}
	if body["status"] != "PENDING" || body["workflow_request_id"] != h.wfReqID(1) || body["requested_by"] != "treasury@damp.local" || body["chain_tx_hash"] != h.txHash {
		t.Fatalf("body = %v", body)
	}
}
