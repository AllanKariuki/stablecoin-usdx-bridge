package api

import (
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
)

// A wallet label is a display name, not a free-text note: the boundary trims
// surrounding whitespace and refuses anything longer than 64 runes before it
// reaches the repository.
func TestUpdateWalletLabelTrimsAndRejectsOverlong(t *testing.T) {
	h := newHarness(t)

	app := fiber.New(fiber.Config{DisableStartupMessage: true, ErrorHandler: platform.ErrorHandler})
	app.Use(h.authMiddleware(t))
	NewHandlers(h.repo, h.svc, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, nil, nil, "").Register(app)

	patch := func(body string) *http.Response {
		req, _ := http.NewRequest(http.MethodPatch, "/wallets/"+h.usd.ID, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+h.bearer)
		resp, err := app.Test(req, 10_000)
		if err != nil {
			t.Fatal(err)
		}
		return resp
	}

	// A 65-rune label is refused at the boundary.
	resp := patch(`{"label":"` + strings.Repeat("x", 65) + `"}`)
	if resp.StatusCode != fiber.StatusBadRequest {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("overlong label: status = %d, want 400 (body %q)", resp.StatusCode, body)
	}

	// Surrounding whitespace is trimmed rather than stored.
	resp = patch(`{"label":"  Savings  "}`)
	if resp.StatusCode != fiber.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("trimmed label: status = %d, want 200 (body %q)", resp.StatusCode, body)
	}
	w, err := h.repo.Wallet(h.ctx, h.usd.ID)
	if err != nil {
		t.Fatal(err)
	}
	if w.Label != "Savings" {
		t.Fatalf("label = %q, want %q (whitespace trimmed)", w.Label, "Savings")
	}
}
