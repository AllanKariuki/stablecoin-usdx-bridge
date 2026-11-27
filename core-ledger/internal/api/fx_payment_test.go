package api

import (
	"bytes"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"testing"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/oidcverify/oidctest"

	"github.com/gofiber/fiber/v2"
)

// POST /fx/payments renders the transaction's metadata, and the net in it is
// the number services/payments reads back to check a converted invoice
// payment actually covered the invoice. This asserts it over HTTP — the same
// JSON a client parses — because the payments-side check keys off exactly
// this field and had no way to see it before.
func TestFXPaymentResponseCarriesMetadataNet(t *testing.T) {
	h := newHarness(t)

	// Only services/payments holds ledger.settlement, and /fx/payments is
	// locked to it — the test speaks as that caller, not as bff.
	settlement := h.issuer.SignToken(t, testAuthAudience, oidctest.Claims{
		Azp:         "svc-payments",
		ClientRoles: map[string][]string{authClient: {roleSettlement}},
	})

	// Seed the payer's KES wallet: PayConverted debits it and credits the
	// payee's USD wallet.
	if _, err := h.svc.Deposit(h.ctx, ledger.DepositRequest{
		WalletID: h.kes.ID, Amount: big.NewInt(130_000_00),
		IdempotencyKey: h.user + ":fxp-seed", BankRef: "SEED",
	}); err != nil {
		t.Fatalf("seed KES deposit: %v", err)
	}

	// The ledger fx_test case: 130,000.00 KES at 1 KES = 0.007692307692307692
	// USD, 50 bps, grosses 999.99 USD and nets 995.00 (99500 in cents). The
	// quote is pinned to the amount and the party, as pricing mints it.
	rate, _ := ledger.ParseRate("0.007692307692307692")
	from := big.NewInt(130_000_00)
	party := h.user
	q := &ledger.FxQuote{
		BaseCcy:    "KES",
		QuoteCcy:   "USD",
		Rate:       rate,
		SpreadBps:  50,
		Source:     "test",
		FromAmount: from,
		PartyID:    &party,
		ExpiresAt:  time.Now().Add(time.Hour),
	}
	if err := h.repo.SaveQuote(h.ctx, q); err != nil {
		t.Fatalf("saving quote: %v", err)
	}

	payload, _ := json.Marshal(map[string]any{
		"from_wallet_id": h.kes.ID,
		"to_wallet_id":   h.usdPayee.ID,
		"amount":         "130000.00",
		"quote_id":       q.ID,
	})
	req, _ := http.NewRequest(http.MethodPost, "/fx/payments", bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+settlement)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", h.user+":fxp")
	resp, err := h.app.Test(req, 10_000)
	if err != nil {
		t.Fatalf("POST /fx/payments: %v", err)
	}
	if resp.StatusCode != fiber.StatusCreated {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		t.Fatalf("POST /fx/payments = %d, want 201 (body: %q)", resp.StatusCode, body)
	}

	var out struct {
		Type     string         `json:"type"`
		Metadata map[string]any `json:"metadata"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if out.Type != string(ledger.TxFXPayment) {
		t.Fatalf("type = %q, want %q", out.Type, ledger.TxFXPayment)
	}
	// Metadata values are smallest-unit integer strings, not decimal amounts:
	// that is what lets a caller compare them without re-doing decimal maths.
	net, ok := out.Metadata["net"].(string)
	if !ok || net == "" {
		t.Fatalf("metadata.net missing or not a string: %#v", out.Metadata)
	}
	if net != "99500" {
		t.Fatalf("metadata.net = %q, want %q", net, "99500")
	}
	if gross, _ := out.Metadata["gross"].(string); gross != "99999" {
		t.Fatalf("metadata.gross = %q, want %q", gross, "99999")
	}
}
