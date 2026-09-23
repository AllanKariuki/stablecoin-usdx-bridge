package platform

import (
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
)

// ChainConfig configures Chain. Metrics is optional — a service that wants
// to opt out of the metrics middleware (unusual, but e.g. a short-lived CLI
// reusing this package for its HTTP debug surface) leaves it nil.
type ChainConfig struct {
	Service string
	Logger  *slog.Logger
	Metrics *Metrics
}

// Chain installs the platform-standard middleware stack in the one order
// that makes every layer after it meaningful: recover first so a panic
// anywhere below is caught and logged instead of killing the process;
// requestid next so every layer after it — tracing, logging, metrics — can
// tag its output with it; otel so the access logger below can attach the
// trace id it just created; logger so every request produces exactly one
// structured line; metrics last, timing everything above it plus the
// handler itself.
func Chain(app *fiber.App, cfg ChainConfig) {
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}

	app.Use(recover.New())
	app.Use(requestid.New())
	app.Use(otelMiddleware(cfg.Service))
	app.Use(accessLogger(cfg.Logger))
	if cfg.Metrics != nil {
		app.Use(cfg.Metrics.Middleware())
	}
}

// accessLogger emits one structured log line per request and stows a
// request-scoped logger (already tagged with request_id/trace_id) in the
// fiber user context so handlers can pull it via
// platform.LoggerFromContext(c.UserContext()) instead of re-deriving it.
func accessLogger(base *slog.Logger) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()

		reqLogger := base.With(slog.String("request_id", RequestID(c)))
		c.SetUserContext(WithLogger(c.UserContext(), reqLogger))

		err := c.Next()

		reqLogger.Info("request",
			slog.String("method", c.Method()),
			slog.String("path", c.Path()),
			slog.Int("status", c.Response().StatusCode()),
			slog.Duration("latency", time.Since(start)),
			slog.String("trace_id", TraceID(c)),
		)
		return err
	}
}
