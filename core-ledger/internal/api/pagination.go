package api

import (
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// parseDateParam reads an optional YYYY-MM-DD query param, returning the
// zero time.Time (meaning "unbounded") when it's absent — matching what
// Repository.Statement already treats as "no lower/upper bound".
func parseDateParam(c *fiber.Ctx, name string) (time.Time, error) {
	raw := c.Query(name)
	if raw == "" {
		return time.Time{}, nil
	}
	return time.Parse("2006-01-02", raw)
}

// Cursors are opaque to the client by design — a generated frontend client
// treats `next_cursor` as an id.Foo it copies back into the next request's
// `cursor` param, never as something it parses to derive a page number or
// jump around. Encoding it (rather than shipping "created_at,id" as plain
// query params) keeps that contract enforced instead of just documented.

// encodeTxCursor packs a transaction page's keyset position
// (created_at, id) into one opaque string.
func encodeTxCursor(createdAt time.Time, id string) string {
	raw := fmt.Sprintf("%s|%s", createdAt.UTC().Format(time.RFC3339Nano), id)
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

// decodeTxCursor is the inverse of encodeTxCursor. An empty cursor decodes
// to the zero position (start of the first page) rather than an error — a
// client's first request has no cursor to send.
func decodeTxCursor(cursor string) (time.Time, string, error) {
	if cursor == "" {
		return time.Time{}, "", nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("malformed cursor")
	}
	parts := strings.SplitN(string(raw), "|", 2)
	if len(parts) != 2 {
		return time.Time{}, "", fmt.Errorf("malformed cursor")
	}
	t, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, "", fmt.Errorf("malformed cursor")
	}
	return t, parts[1], nil
}

// encodeAccountCursor/decodeAccountCursor do the same for the accounts
// list, whose keyset position is just gl_code.
func encodeAccountCursor(glCode string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(glCode))
}

func decodeAccountCursor(cursor string) (string, error) {
	if cursor == "" {
		return "", nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return "", fmt.Errorf("malformed cursor")
	}
	return string(raw), nil
}

// clampLimit keeps a client-supplied page size sane: positive, and capped so
// a `?limit=1000000` can't turn a paginated endpoint into an unbounded one.
func clampLimit(requested, def, maxLimit int) int {
	if requested <= 0 {
		return def
	}
	if requested > maxLimit {
		return maxLimit
	}
	return requested
}
