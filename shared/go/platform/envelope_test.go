package platform

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/requestid"
)

func TestWriteError_EnvelopeShapeIncludesRequestID(t *testing.T) {
	app := fiber.New()
	app.Use(requestid.New())
	app.Get("/boom", func(c *fiber.Ctx) error {
		return WriteError(c, fiber.StatusConflict, "ACCOUNT_FROZEN", "wallet is frozen")
	})

	resp, err := app.Test(httptest.NewRequest("GET", "/boom", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusConflict {
		t.Fatalf("expected 409, got %d", resp.StatusCode)
	}

	var body ErrorResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if body.Error != "wallet is frozen" || body.Code != "ACCOUNT_FROZEN" {
		t.Fatalf("unexpected envelope: %+v", body)
	}
	if body.RequestID == "" {
		t.Fatal("expected a non-empty request_id in the envelope")
	}
}

func TestErrorHandler_UnhandledPanicStillProducesEnvelope(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler})
	app.Use(requestid.New())
	app.Get("/notfound", func(c *fiber.Ctx) error {
		return fiber.NewError(fiber.StatusNotFound, "wallet not found")
	})

	resp, err := app.Test(httptest.NewRequest("GET", "/notfound", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}

	var body ErrorResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if body.Code != "NOT_FOUND" || body.RequestID == "" {
		t.Fatalf("unexpected envelope: %+v", body)
	}
}
