package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
)

// The guarantee under test is the one a client depends on to retry safely: the
// second call returns the first call's bytes. It needs a real database — the
// uniqueness that makes it true is an index — and a real router, because the
// bug it replaces lived in the handler's work *around* the posting, not in the
// posting.
//
//	docker compose up -d postgres
//	LEDGER_TEST_DATABASE_URL='postgres://bridge:bridge@localhost:55433/bridge?sslmode=disable' \
//	  go test ./internal/api -run TestIdempotent -count=1

var (
	apiOnce sync.Once
	apiRepo *ledger.Repository
	apiErr  error
)

type harness struct {
	app  *fiber.App
	repo *ledger.Repository
	svc  *ledger.Service
	ctx  context.Context

	user       string
	usd        *ledger.Wallet
	usdPayee   *ledger.Wallet
	kes        *ledger.Wallet
	usdxEth    *ledger.Wallet
	usdxSolana *ledger.Wallet
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	dsn := os.Getenv("LEDGER_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set LEDGER_TEST_DATABASE_URL to run api integration tests")
	}
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

	app := fiber.New(fiber.Config{DisableStartupMessage: true, ErrorHandler: platform.ErrorHandler})
	NewHandlers(apiRepo, svc, slog.New(slog.NewTextHandler(io.Discard, nil)), nil).Register(app)

	h := &harness{app: app, repo: apiRepo, svc: svc, ctx: ctx,
		user: "api-" + t.Name() + "-" + time.Now().UTC().Format("20060102150405.000000000")}

	h.usd = h.wallet(t, "USD", "", "")
	h.usdPayee = h.payeeWallet(t)
	h.kes = h.wallet(t, "KES", "", "")
	h.usdxEth = h.wallet(t, "USDX", "ETHEREUM", "0xUSER")
	h.usdxSolana = h.wallet(t, "USDX", "SOLANA", "SoLUSER")

	// Fund the USD wallet, then move USD-X into the Ethereum wallet the way
	// the platform really does: issue (which parks it in suspense), then
	// release it as the saga's confirmation would.
	if _, err := svc.Deposit(ctx, ledger.DepositRequest{
		WalletID: h.usd.ID, Amount: big.NewInt(1_000_00),
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

	return h
}

func (h *harness) wallet(t *testing.T, currency, chain, address string) *ledger.Wallet {
	t.Helper()
	w, err := h.repo.EnsureWallet(h.ctx, h.user, currency, chain, address, currency)
	if err != nil {
		t.Fatalf("EnsureWallet %s/%s: %v", currency, chain, err)
	}
	return w
}

func (h *harness) payeeWallet(t *testing.T) *ledger.Wallet {
	t.Helper()
	w, err := h.repo.EnsureWallet(h.ctx, h.user+"-payee", "USD", "", "", "Payee")
	if err != nil {
		t.Fatalf("EnsureWallet payee: %v", err)
	}
	return w
}

type response struct {
	status int
	body   []byte
	replay string
}

func (h *harness) post(t *testing.T, path, key string, payload any) response {
	t.Helper()
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("encoding request: %v", err)
	}
	req, err := http.NewRequest(http.MethodPost, path, bytes.NewReader(encoded))
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", key)
	req.Header.Set("X-User-Id", h.user)

	// Generous timeout: these run a SERIALIZABLE posting against a real
	// database, not a stub.
	resp, err := h.app.Test(req, 10_000)
	if err != nil {
		t.Fatalf("POST %s: %v", path, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("reading response: %v", err)
	}
	return response{status: resp.StatusCode, body: body, replay: resp.Header.Get("Idempotent-Replay")}
}

func (h *harness) quoteID(t *testing.T) string {
	t.Helper()
	resp := h.post(t, "/fx/quotes", h.user+":quote", fiber.Map{
		"base_currency": "USD", "quote_currency": "KES", "rate": "129.5", "ttl_seconds": 3600,
	})
	if resp.status != fiber.StatusCreated {
		t.Fatalf("creating a quote: %d %s", resp.status, resp.body)
	}
	var out struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(resp.body, &out); err != nil {
		t.Fatalf("decoding quote: %v", err)
	}
	return out.ID
}

// TestIdempotentWritesReplayByteForByte covers every money-moving write.
//
// Before P2 the retry re-ran the whole handler and only the journal posting
// was deduplicated. On the issuance path that meant the second identical POST
// re-derived the same correlation id, hit the bridge_transfers primary key and
// returned {"error":"internal error"} — a 500, from the endpoint that mints
// money, in answer to the retry idempotency exists to make safe.
func TestIdempotentWritesReplayByteForByte(t *testing.T) {
	h := newHarness(t)
	quote := h.quoteID(t)

	cases := []struct {
		name    string
		path    string
		payload any
		want    int
	}{
		{"deposit", "/deposits", fiber.Map{
			"wallet_id": h.usd.ID, "amount": "250.00", "reference": "BANK-IDEM",
		}, fiber.StatusCreated},

		{"withdrawal", "/withdrawals", fiber.Map{
			"wallet_id": h.usd.ID, "amount": "10.00", "reference": "BANK-OUT",
		}, fiber.StatusCreated},

		{"transfer", "/transfers", fiber.Map{
			"from_wallet_id": h.usd.ID, "to_wallet_id": h.usdPayee.ID, "amount": "5.00",
		}, fiber.StatusCreated},

		{"conversion", "/fx/conversions", fiber.Map{
			"from_wallet_id": h.usd.ID, "to_wallet_id": h.kes.ID, "amount": "20.00", "quote_id": quote,
		}, fiber.StatusCreated},

		{"issuance", "/issuances", fiber.Map{
			"fiat_wallet_id": h.usd.ID, "usdx_wallet_id": h.usdxEth.ID, "amount": "100.00",
		}, fiber.StatusAccepted},

		{"redemption", "/redemptions", fiber.Map{
			"usdx_wallet_id": h.usdxEth.ID, "fiat_wallet_id": h.usd.ID, "amount": "25.00",
		}, fiber.StatusAccepted},

		{"bridge", "/bridges", fiber.Map{
			"from_wallet_id": h.usdxEth.ID, "to_wallet_id": h.usdxSolana.ID, "amount": "15.00",
		}, fiber.StatusAccepted},

		{"fee", "/ledger/fees", fiber.Map{
			"wallet_id": h.usd.ID, "amount": "1.00", "fee_gl_code": "4300.USD", "reason": "late payment",
		}, fiber.StatusCreated},

		// Bank charges against the fiat clearing account: the only two USD
		// accounts an operator may hand-post to, which is the point — every
		// other one carries an invariant the engine maintains.
		{"manual journal", "/ledger/journals", fiber.Map{
			"reason": "custodian wire fee taken from an unallocated credit",
			"lines": []fiber.Map{
				{"gl_code": "5200.USD", "direction": "DEBIT", "amount": "1.00"},
				{"gl_code": "2300.FIAT.USD", "direction": "CREDIT", "amount": "1.00"},
			},
		}, fiber.StatusCreated},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			key := h.user + ":" + tc.name

			first := h.post(t, tc.path, key, tc.payload)
			if first.status != tc.want {
				t.Fatalf("first call: status %d, want %d — body %s", first.status, tc.want, first.body)
			}
			if first.replay != "" {
				t.Fatalf("first call was marked a replay")
			}

			second := h.post(t, tc.path, key, tc.payload)
			if second.status != first.status {
				t.Fatalf("retry: status %d, want %d — body %s", second.status, first.status, second.body)
			}
			if !bytes.Equal(first.body, second.body) {
				t.Fatalf("retry returned a different body.\nfirst:  %s\nsecond: %s", first.body, second.body)
			}
			if second.replay != "true" {
				t.Fatalf("retry was not marked a replay")
			}
		})
	}
}

// TestIdempotencyKeyReuseIsRejected is the other half of the contract.
// Replaying the first call's response for a *different* request body would
// tell a client that a transfer it never made had succeeded.
func TestIdempotencyKeyReuseIsRejected(t *testing.T) {
	h := newHarness(t)
	key := h.user + ":reused"

	first := h.post(t, "/deposits", key, fiber.Map{
		"wallet_id": h.usd.ID, "amount": "10.00", "reference": "A",
	})
	if first.status != fiber.StatusCreated {
		t.Fatalf("first deposit: %d %s", first.status, first.body)
	}

	second := h.post(t, "/deposits", key, fiber.Map{
		"wallet_id": h.usd.ID, "amount": "9999.00", "reference": "B",
	})
	if second.status != fiber.StatusConflict {
		t.Fatalf("reused key: status %d, want 409 — body %s", second.status, second.body)
	}

	var envelope struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(second.body, &envelope); err != nil {
		t.Fatalf("decoding error envelope: %v", err)
	}
	if envelope.Code != "IDEMPOTENCY_KEY_REUSED" {
		t.Fatalf("code = %q, want IDEMPOTENCY_KEY_REUSED", envelope.Code)
	}

	// And a different endpoint with the same key is a collision too.
	third := h.post(t, "/withdrawals", key, fiber.Map{
		"wallet_id": h.usd.ID, "amount": "10.00", "reference": "A",
	})
	if third.status != fiber.StatusConflict {
		t.Fatalf("key reused across endpoints: status %d, want 409 — body %s", third.status, third.body)
	}
}

// TestIssuanceRetryEnqueuesOneSaga is the specific defect P2 set out to fix:
// the retry used to insert a second bridge_transfers row under the same
// correlation id and return a duplicate-key 500.
func TestIssuanceRetryEnqueuesOneSaga(t *testing.T) {
	h := newHarness(t)
	key := h.user + ":issue-once"
	payload := fiber.Map{
		"fiat_wallet_id": h.usd.ID, "usdx_wallet_id": h.usdxEth.ID, "amount": "40.00",
	}

	first := h.post(t, "/issuances", key, payload)
	if first.status != fiber.StatusAccepted {
		t.Fatalf("first issuance: %d %s", first.status, first.body)
	}
	second := h.post(t, "/issuances", key, payload)
	if second.status != fiber.StatusAccepted {
		t.Fatalf("retried issuance: status %d, want 202 — body %s", second.status, second.body)
	}

	var out struct {
		CorrelationID string `json:"correlation_id"`
	}
	if err := json.Unmarshal(first.body, &out); err != nil {
		t.Fatalf("decoding issuance: %v", err)
	}
	transfer, err := h.repo.FindByCorrelationID(out.CorrelationID)
	if err != nil {
		t.Fatalf("loading the saga: %v", err)
	}
	if transfer.Kind != ledger.SagaMint {
		t.Fatalf("saga kind = %s, want MINT", transfer.Kind)
	}
	if transfer.Status != ledger.StatusPending {
		t.Fatalf("saga status = %s, want PENDING — the API must enqueue, not execute", transfer.Status)
	}
}
