package platform

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestHealth_ReadyzDegradesOnFailingCheck(t *testing.T) {
	h := NewHealth("test-service", "1.2.3", "abcdef")
	h.AddCheck("database", func(ctx context.Context) error { return errors.New("connection refused") })

	app := fiber.New()
	h.Register(app)

	resp, err := app.Test(httptest.NewRequest("GET", "/readyz", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusServiceUnavailable {
		t.Fatalf("expected 503 when a check fails, got %d", resp.StatusCode)
	}
}

func TestHealth_ReadyzFlipsFalseAfterSetReady(t *testing.T) {
	h := NewHealth("test-service", "1.2.3", "abcdef")
	app := fiber.New()
	h.Register(app)

	resp, _ := app.Test(httptest.NewRequest("GET", "/readyz", nil))
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200 before SetReady(false), got %d", resp.StatusCode)
	}

	h.SetReady(false)

	resp, _ = app.Test(httptest.NewRequest("GET", "/readyz", nil))
	if resp.StatusCode != fiber.StatusServiceUnavailable {
		t.Fatalf("expected 503 after SetReady(false), got %d", resp.StatusCode)
	}
}

func TestHealth_HealthzAlwaysOkRegardlessOfReadiness(t *testing.T) {
	h := NewHealth("test-service", "1.2.3", "abcdef")
	h.SetReady(false)
	app := fiber.New()
	h.Register(app)

	resp, _ := app.Test(httptest.NewRequest("GET", "/healthz", nil))
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("liveness must never reflect readiness state, got %d", resp.StatusCode)
	}
}

func TestHealth_VersionReportsInjectedValues(t *testing.T) {
	h := NewHealth("test-service", "1.2.3", "abcdef")
	app := fiber.New()
	h.Register(app)

	resp, _ := app.Test(httptest.NewRequest("GET", "/version", nil))
	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if body["service"] != "test-service" || body["version"] != "1.2.3" || body["commit"] != "abcdef" {
		t.Fatalf("unexpected /version body: %v", body)
	}
}
