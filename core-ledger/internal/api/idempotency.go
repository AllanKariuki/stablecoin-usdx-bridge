package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"

	"github.com/gofiber/fiber/v2"
)

// idempotent wraps every money-moving write.
//
// It sits in front of the handler rather than inside it because the guarantee
// has to cover everything the handler does, not just the journal posting: the
// saga row it inserts, the correlation id it derives, the body it renders. A
// retry that re-ran all of that and only deduplicated the posting is how the
// issuance endpoint ended up returning a duplicate-key 500 to the second of
// two identical requests.
func (h *Handlers) idempotent(c *fiber.Ctx) error {
	key := c.Get("Idempotency-Key")
	if key == "" {
		return fail(c, &ledger.PostingError{
			Code:    "MISSING_IDEMPOTENCY_KEY",
			Message: "an Idempotency-Key header is required on every write, and must be reused when retrying",
		})
	}

	// The route pattern, not the concrete path: two different redemptions
	// confirmed with the same key are a key collision, and should be told so
	// rather than having one replay the other's body.
	endpoint := c.Method() + " " + c.Route().Path
	hash := sha256.Sum256(c.Body())

	existing, err := h.repo.BeginIdempotent(c.Context(), key, endpoint, hex.EncodeToString(hash[:]))
	if err != nil {
		return fail(c, err)
	}
	if existing != nil {
		if existing.Status == ledger.IdempotencyCompleted && existing.StatusCode != nil {
			c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
			c.Set("Idempotent-Replay", "true")
			return c.Status(*existing.StatusCode).Send(existing.ResponseBody)
		}
		// The first call is still in flight. 409 rather than a wait: the
		// client already knows how to retry — that is why it sent a key.
		return fail(c, &ledger.PostingError{
			Code:    "IDEMPOTENT_REQUEST_IN_PROGRESS",
			Message: "another request is using idempotency key " + key + " right now; retry shortly",
		})
	}

	// A panic unwinding through c.Next() would otherwise leave the key
	// IN_PROGRESS with nothing to clear it, so the client's retry — the whole
	// point of having sent a key — would be refused until the record went
	// stale. The context is deliberately not the request's: it may already be
	// cancelled by the time this runs.
	settled := false
	defer func() {
		if !settled {
			_ = h.repo.ReleaseIdempotent(context.Background(), key)
		}
	}()

	if err := c.Next(); err != nil {
		settled = true
		_ = h.repo.ReleaseIdempotent(c.Context(), key)
		return err
	}

	status := c.Response().StatusCode()
	if status >= fiber.StatusInternalServerError {
		// An unknown outcome must not be pinned to the key, or the retry that
		// would resolve it can never be made.
		settled = true
		_ = h.repo.ReleaseIdempotent(c.Context(), key)
		return nil
	}
	settled = true

	// Response().Body() points into a buffer fasthttp reuses between requests.
	body := append([]byte(nil), c.Response().Body()...)
	if err := h.repo.CompleteIdempotent(c.Context(), key, status, body); err != nil {
		h.logger.Error("could not store an idempotent response; a retry will re-run the handler",
			"idempotency_key", key, "error", err)
	}
	return nil
}
