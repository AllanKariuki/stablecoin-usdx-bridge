package platform

import (
	"errors"

	"github.com/gofiber/fiber/v2"
)

// ErrorResponse is the platform-wide error envelope. Every service that
// pulls in this package returns exactly this shape, so a generated client
// can assume `error`/`code` are always present and `request_id` is always
// there to correlate a support ticket with a log line.
type ErrorResponse struct {
	Error     string `json:"error"`
	Code      string `json:"code"`
	RequestID string `json:"request_id"`
}

// WriteError writes the envelope with the request id pulled from fiber's
// requestid middleware (via c.Locals), so call sites never have to thread it
// through by hand.
func WriteError(c *fiber.Ctx, status int, code, message string) error {
	return c.Status(status).JSON(ErrorResponse{
		Error:     message,
		Code:      code,
		RequestID: RequestID(c),
	})
}

// RequestID reads the id set by the requestid middleware in Chain. Empty if
// Chain wasn't installed on this app.
func RequestID(c *fiber.Ctx) string {
	if id, ok := c.Locals("requestid").(string); ok {
		return id
	}
	return ""
}

// ErrorHandler is a fiber.Config.ErrorHandler that guarantees the
// {error, code, request_id} envelope even for errors the handler layer never
// saw — a panic recovered upstream, a routing 404, a body-parser failure
// fiber raises itself.
func ErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	errCode := "INTERNAL"
	msg := "internal error"

	var fe *fiber.Error
	if errors.As(err, &fe) {
		code = fe.Code
		msg = fe.Message
		errCode = "REQUEST_ERROR"
		if code == fiber.StatusNotFound {
			errCode = "NOT_FOUND"
		}
	}

	return WriteError(c, code, errCode, msg)
}
