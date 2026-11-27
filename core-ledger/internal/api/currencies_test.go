package api

import (
	"encoding/json"
	"net/http"
	"testing"
)

// GET /currencies is the supported-currency set the portal renders from
// (slice 4b): every DefaultCurrencies row, with the derived native chain —
// and nothing more, so a seeded row a client doesn't know how to render
// fails loudly here rather than silently in a wallet screen.
func TestListCurrencies(t *testing.T) {
	h := newHarness(t)

	req, _ := http.NewRequest(http.MethodGet, "/currencies", nil)
	req.Header.Set("Authorization", "Bearer "+h.bearer)
	resp, err := h.app.Test(req, 10_000)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var body struct {
		Currencies []struct {
			Code        string `json:"code"`
			Kind        string `json:"kind"`
			Decimals    int32  `json:"decimals"`
			Name        string `json:"name"`
			NativeChain string `json:"native_chain"`
		} `json:"currencies"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}

	byCode := map[string]struct {
		kind        string
		decimals    int32
		nativeChain string
	}{}
	for _, c := range body.Currencies {
		byCode[c.Code] = struct {
			kind        string
			decimals    int32
			nativeChain string
		}{c.Kind, c.Decimals, c.NativeChain}
	}

	for _, want := range []struct {
		code, kind, nativeChain string
		decimals                int32
	}{
		{"USD", "FIAT", "", 2},
		{"KES", "FIAT", "", 2},
		{"BTC", "CRYPTO", "BITCOIN", 8},
		{"ETH", "CRYPTO", "ETHEREUM", 18},
		{"SOL", "CRYPTO", "SOLANA", 9},
		// USD-X lives on two chains, so no one chain is native to it.
		{"USDX", "CRYPTO", "", 6},
	} {
		got, ok := byCode[want.code]
		if !ok {
			t.Fatalf("currencies missing %s (got %d rows)", want.code, len(body.Currencies))
		}
		if got.kind != want.kind || got.decimals != want.decimals || got.nativeChain != want.nativeChain {
			t.Errorf("%s = %+v, want kind=%s decimals=%d native_chain=%q",
				want.code, got, want.kind, want.decimals, want.nativeChain)
		}
	}
}

// The currencies read is a user-proxy surface, not a pricing one: the role
// split is what keeps a wrong-service token out.
func TestListCurrenciesDeniesThePricingRole(t *testing.T) {
	h := newHarness(t)

	req, _ := http.NewRequest(http.MethodGet, "/currencies", nil)
	req.Header.Set("Authorization", "Bearer "+h.pricingBearer)
	resp, err := h.app.Test(req, 10_000)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 for the pricing role", resp.StatusCode)
	}
}
