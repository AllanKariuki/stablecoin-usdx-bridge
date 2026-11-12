package api

import (
	"database/sql"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/audit"

	"github.com/gofiber/fiber/v2"
)

// End to end through the router: the actor is X-User-Id via actor(), and the
// request id, source IP and roles the gateway set arrive at the outbox row
// written inside the repository's transaction — the path cmd/server wires.
func TestIntegrationWalletStatusChangeIsAuditedWithTheCallersIdentity(t *testing.T) {
	h := newHarness(t)

	app := fiber.New(fiber.Config{DisableStartupMessage: true, ErrorHandler: platform.ErrorHandler})
	platform.Chain(app, platform.ChainConfig{Service: "core-ledger-test", Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	app.Use(audit.Middleware())
	NewHandlers(h.repo, h.svc, slog.New(slog.NewTextHandler(io.Discard, nil)), nil).Register(app)

	req, _ := http.NewRequest(http.MethodPost, "/wallets/"+h.usd.ID+"/status", strings.NewReader(`{"status":"FROZEN"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-Id", "compliance-frank")
	req.Header.Set("X-Roles", "compliance_officer")
	req.Header.Set("X-Request-Id", "gw-req-77")
	req.Header.Set("X-Forwarded-For", "192.0.2.10")
	resp, err := app.Test(req, 10_000)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}

	db, err := sql.Open("pgx", os.Getenv("LEDGER_TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var actor, requestID, sourceIP, roles string
	err = db.QueryRow(`
		SELECT payload->>'actor', payload->>'request_id', payload->>'source_ip', payload->'actor_roles'->>0
		  FROM audit_outbox
		 WHERE action = 'ledger.wallet.status_changed' AND payload->>'subject_id' = $1`, h.usd.ID).
		Scan(&actor, &requestID, &sourceIP, &roles)
	if err != nil {
		t.Fatalf("reading the audit event: %v", err)
	}
	if actor != "compliance-frank" || requestID != "gw-req-77" || sourceIP != "192.0.2.10" || roles != "compliance_officer" {
		t.Fatalf("audit event: actor=%q request_id=%q source_ip=%q role=%q", actor, requestID, sourceIP, roles)
	}
}
