package platform

import (
	"github.com/gofiber/fiber/v2"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// otelMiddleware starts one span per request using whatever TracerProvider
// is globally registered. Until a service wires up a real exporter (the
// OTLP/LGTM stack lands in P3 — see docs/building-plan.md), otel.Tracer
// resolves to the SDK's no-op provider: spans are created and immediately
// discarded, at negligible cost, rather than the middleware chain having a
// tracing-shaped hole in it that has to be retrofitted later.
func otelMiddleware(service string) fiber.Handler {
	tracer := otel.Tracer(service)
	return func(c *fiber.Ctx) error {
		ctx, span := tracer.Start(c.UserContext(), c.Method()+" "+c.Path(),
			trace.WithAttributes(
				attribute.String("http.method", c.Method()),
				attribute.String("http.target", c.Path()),
			),
		)
		defer span.End()

		c.SetUserContext(ctx)
		c.Locals("trace_id", span.SpanContext().TraceID().String())

		err := c.Next()

		span.SetAttributes(attribute.Int("http.status_code", c.Response().StatusCode()))
		if err != nil {
			span.RecordError(err)
		}
		return err
	}
}

// TraceID returns the current request's trace id, or "" if no span is
// active (e.g. tracing middleware not installed, or a no-op provider that
// still yields an all-zero id).
func TraceID(c *fiber.Ctx) string {
	if id, ok := c.Locals("trace_id").(string); ok {
		return id
	}
	return ""
}
