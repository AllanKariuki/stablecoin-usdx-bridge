package api

import (
	"bytes"
	"encoding/json"
	"math/big"
	"net/http"
	"testing"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/oidcverify/oidctest"

	"github.com/gofiber/fiber/v2"
)

// The treasury surface over HTTP: positions render as decimal strings at each
// currency's own scale, and a rebalance post goes through the full app —
// auth boundary included — like rms' production call does.

func treasuryBearer(t *testing.T, h *harness) string {
	t.Helper()
	return h.issuer.SignToken(t, testAuthAudience, oidctest.Claims{
		Azp:         "svc-rms",
		ClientRoles: map[string][]string{authClient: {roleTreasury}},
	})
}

type treasuryPosition struct {
	Currency            string `json:"currency"`
	Decimals            int32  `json:"decimals"`
	CustomerLiabilities string `json:"customer_liabilities"`
	CustodyHoldings     string `json:"custody_holdings"`
	FxPosition          string `json:"fx_position"`
	NetExposure         string `json:"net_exposure"`
}

func positionsOf(t *testing.T, h *harness, bearer string) map[string]treasuryPosition {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, "/treasury/positions", nil)
	req.Header.Set("Authorization", "Bearer "+bearer)
	resp, err := h.app.Test(req, 10_000)
	if err != nil {
		t.Fatalf("GET /treasury/positions: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("GET /treasury/positions = %d, want 200", resp.StatusCode)
	}
	var body struct {
		Positions []treasuryPosition `json:"positions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	out := make(map[string]treasuryPosition, len(body.Positions))
	for _, p := range body.Positions {
		out[p.Currency] = p
	}
	return out
}

func (h *harness) rebalance(t *testing.T, bearer string, payload any) *http.Response {
	t.Helper()
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest(http.MethodPost, "/treasury/rebalances", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+bearer)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", h.user+":rebalance:"+time.Now().UTC().Format("150405.000000000"))
	resp, err := h.app.Test(req, 10_000)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

// addDecimalAt adds a signed decimal string to another, both at `decimals`
// places, using the ledger's own parse/format pair — so the test never
// reimplements decimal arithmetic, only reuses it.
func addDecimalAt(t *testing.T, base, delta string, decimals int32) string {
	t.Helper()
	b, err := ledger.ParseDecimal(base, decimals)
	if err != nil {
		t.Fatal(err)
	}
	d, err := ledger.ParseDecimal(delta, decimals)
	if err != nil {
		t.Fatal(err)
	}
	return ledger.FormatDecimal(new(big.Int).Add(b, d), decimals)
}

// A conversion through the service (the flows are the ledger package's test
// subject) moves the HTTP-reported position by exactly the bought BTC, and a
// rebalance post through the app closes it again. Both reads are relative:
// the shared test database already holds other tests' BTC activity.
func TestTreasuryPositionsAndRebalanceOverHTTP(t *testing.T) {
	h := newHarness(t)
	bearer := treasuryBearer(t, h)

	before := positionsOf(t, h, h.bearer)
	for _, ccy := range []string{"BTC", "ETH", "SOL"} {
		if _, ok := before[ccy]; !ok {
			t.Fatalf("positions missing %s", ccy)
		}
	}

	// KES -> BTC: 130,000 KES at 2 satoshi/KES = 260,000 sat = 0.0026 BTC.
	kes := h.wallet(t, "KES", "", "")
	btc := h.wallet(t, "BTC", "", "")
	if _, err := h.svc.Deposit(h.ctx, ledger.DepositRequest{
		WalletID: kes.ID, Amount: big.NewInt(130_000_00), IdempotencyKey: h.user + ":seed-kes", BankRef: "SEED",
	}); err != nil {
		t.Fatal(err)
	}
	rate, _ := ledger.ParseRate("0.00000002")
	q := &ledger.FxQuote{BaseCcy: "KES", QuoteCcy: "BTC", Rate: rate, SpreadBps: 0, Source: "test", ExpiresAt: time.Now().Add(time.Hour)}
	if err := h.repo.SaveQuote(h.ctx, q); err != nil {
		t.Fatal(err)
	}
	if _, err := h.svc.Convert(h.ctx, ledger.ConvertRequest{
		FromWalletID: kes.ID, ToWalletID: btc.ID,
		Amount: big.NewInt(130_000_00), QuoteID: q.ID, IdempotencyKey: h.user + ":fx",
	}); err != nil {
		t.Fatal(err)
	}

	after := positionsOf(t, h, h.bearer)
	btcBefore, btcAfter := before["BTC"], after["BTC"]

	// The position is rendered at BTC's own 8-decimal scale, as strings.
	if btcAfter.Decimals != 8 {
		t.Fatalf("BTC decimals = %d, want 8", btcAfter.Decimals)
	}
	if got, want := btcAfter.CustomerLiabilities, addDecimalAt(t, btcBefore.CustomerLiabilities, "0.00260000", 8); got != want {
		t.Fatalf("BTC customer_liabilities = %s, want %s", got, want)
	}
	// Custody is untouched by a customer conversion, and the short is the
	// full bought amount: custody - liabilities moved by -0.0026 BTC.
	if btcAfter.CustodyHoldings != btcBefore.CustodyHoldings {
		t.Fatalf("BTC custody_holdings moved %s -> %s, want unchanged",
			btcBefore.CustodyHoldings, btcAfter.CustodyHoldings)
	}
	if got, want := btcAfter.NetExposure, addDecimalAt(t, btcBefore.NetExposure, "-0.00260000", 8); got != want {
		t.Fatalf("BTC net_exposure = %s, want %s", got, want)
	}

	// A BUY rebalance through the app — rms' shape — closes the short.
	resp := h.rebalance(t, bearer, map[string]any{
		"side":          "BUY",
		"currency":      "BTC",
		"amount":        "0.00260000",
		"fiat_currency": "KES",
		"fiat_amount":   "130000.00",
		"custodian_ref": "TRADE-HTTP-1",
		"note":          "closing the demo short",
	})
	if resp.StatusCode != fiber.StatusCreated {
		body := new(bytes.Buffer)
		_, _ = body.ReadFrom(resp.Body)
		t.Fatalf("POST /treasury/rebalances = %d, want 201 (body %s)", resp.StatusCode, body)
	}

	closed := positionsOf(t, h, h.bearer)
	if got, want := closed["BTC"].CustodyHoldings, addDecimalAt(t, btcBefore.CustodyHoldings, "0.00260000", 8); got != want {
		t.Fatalf("BTC custody_holdings = %s, want %s (the bought BTC is at the custodian now)", got, want)
	}
	// Liabilities are untouched and custody rose by the bought amount, so
	// the short is back where the test found it: net moved by +0.0026.
	if got, want := closed["BTC"].NetExposure, btcBefore.NetExposure; got != want {
		t.Fatalf("BTC net_exposure = %s, want %s (short closed)", got, want)
	}

	// Validation: an unknown side is refused before anything is posted.
	bad := h.rebalance(t, bearer, map[string]any{
		"side": "HOLD", "currency": "BTC", "amount": "0.001",
		"fiat_currency": "KES", "fiat_amount": "1000.00",
	})
	if bad.StatusCode != fiber.StatusBadRequest {
		t.Fatalf("POST /treasury/rebalances with side HOLD = %d, want 400", bad.StatusCode)
	}
}
