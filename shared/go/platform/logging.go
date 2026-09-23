package platform

import (
	"context"
	"log/slog"
	"os"
	"strings"
)

type loggerCtxKey struct{}

// NewLogger builds a JSON slog.Logger tagged with the service name on every
// line, so a shared log pipeline (Loki/CloudWatch/whatever) can filter by
// service without every service inventing its own field name for it.
func NewLogger(service, level string) *slog.Logger {
	h := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: parseLevel(level),
	})
	return slog.New(h).With(slog.String("service", service))
}

func parseLevel(level string) slog.Level {
	switch strings.ToLower(level) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// WithLogger returns a context carrying logger, for handlers below the
// middleware chain to retrieve via LoggerFromContext instead of threading a
// *slog.Logger through every function signature.
func WithLogger(ctx context.Context, logger *slog.Logger) context.Context {
	return context.WithValue(ctx, loggerCtxKey{}, logger)
}

// LoggerFromContext returns the request-scoped logger (already tagged with
// request_id and trace_id by the middleware chain), falling back to
// slog.Default() so a call site outside a request never nil-panics.
func LoggerFromContext(ctx context.Context) *slog.Logger {
	if l, ok := ctx.Value(loggerCtxKey{}).(*slog.Logger); ok && l != nil {
		return l
	}
	return slog.Default()
}
