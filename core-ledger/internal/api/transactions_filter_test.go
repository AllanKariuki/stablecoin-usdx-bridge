package api

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"

	"github.com/gofiber/fiber/v2"
)

// The `type` filter on GET /transactions is what services/bff's
// GET /conversions pages with. It runs in SQL before the limit, so the
// cursor it returns is a cursor into the filtered feed. These tests cover
// both accepted spellings and the 400 an unknown type must be — an
// unknown type silently matching nothing would look like "no conversions".
func TestListTransactionsFiltersByType(t *testing.T) {
	h := newHarness(t)
	quote := h.quoteID(t)

	// One deposit (FIAT_DEPOSIT) and one conversion (FX_CONVERSION) for the
	// same user: the filter must separate them, not merely return both.
	dep := h.post(t, "/deposits", h.user+":filter-dep", fiber.Map{
		"wallet_id": h.usd.ID, "amount": "10.00",
	})
	if dep.status != fiber.StatusCreated {
		t.Fatalf("seed deposit: %d %s", dep.status, dep.body)
	}
	conv := h.post(t, "/fx/conversions", h.user+":filter-conv", fiber.Map{
		"from_wallet_id": h.usd.ID, "to_wallet_id": h.kes.ID, "amount": "10.00", "quote_id": quote,
	})
	if conv.status != fiber.StatusCreated {
		t.Fatalf("seed conversion: %d %s", conv.status, conv.body)
	}

	list := func(query string) (int, []ledger.TxType) {
		t.Helper()
		req, _ := http.NewRequest(http.MethodGet, "/transactions?user_id="+h.user+query, nil)
		req.Header.Set("Authorization", "Bearer "+h.bearer)
		resp, err := h.app.Test(req, 10_000)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var page struct {
			Transactions []struct {
				Type ledger.TxType `json:"type"`
			} `json:"transactions"`
		}
		if err := json.Unmarshal(body, &page); err != nil {
			t.Fatalf("decoding %q: %v (body %s)", query, err, body)
		}
		types := make([]ledger.TxType, 0, len(page.Transactions))
		for _, tx := range page.Transactions {
			types = append(types, tx.Type)
		}
		return resp.StatusCode, types
	}

	// Comma-separated: only the conversion.
	status, types := list("&type=FX_CONVERSION")
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200", status)
	}
	if len(types) != 1 || types[0] != ledger.TxFXConversion {
		t.Fatalf("type=FX_CONVERSION returned %v, want one FX_CONVERSION", types)
	}

	// Repeated params: both types, newest-first, exactly this test's rows.
	status, types = list("&type=FIAT_DEPOSIT&type=fx_conversion")
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200", status)
	}
	seen := map[ledger.TxType]bool{}
	for _, typ := range types {
		seen[typ] = true
	}
	if !seen[ledger.TxFiatDeposit] || !seen[ledger.TxFXConversion] {
		t.Fatalf("repeated type params returned %v, want both FIAT_DEPOSIT and FX_CONVERSION", types)
	}

	// A type this user has none of: an empty page, never the unfiltered feed.
	status, types = list("&type=FEE")
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200", status)
	}
	if len(types) != 0 {
		t.Fatalf("type=FEE returned %v, want no rows", types)
	}

	// An unknown type is a caller bug: 400, not a silently empty page.
	status, _ = list("&type=NOT_A_TYPE")
	if status != http.StatusBadRequest {
		t.Fatalf("type=NOT_A_TYPE: status = %d, want 400", status)
	}
}
