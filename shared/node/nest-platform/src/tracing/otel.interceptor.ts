import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Request, Response } from 'express-serve-static-core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PLATFORM_SERVICE_NAME } from '../constants';

/**
 * OtelInterceptor starts one span per request against whatever
 * TracerProvider is globally registered — the direct counterpart of
 * shared/go/platform/tracing.go's otelMiddleware. Until a service wires up
 * a real exporter (the OTLP/LGTM stack lands in P3 per docs/building-plan.md),
 * `trace.getTracer()` resolves to `@opentelemetry/api`'s own no-op provider:
 * spans are created and immediately discarded at negligible cost, rather
 * than the request pipeline having a tracing-shaped hole retrofitted later.
 *
 * Deliberately just `@opentelemetry/api` (the thin, stable, framework-
 * agnostic surface), not `@opentelemetry/sdk-node` or any auto-instrumentation
 * package — same "real API, no exporter yet" posture as the Go side, and the
 * same reason: auto-instrumentation packages pull in per-library patches for
 * every HTTP client/ORM a service might use, which is scope this platform
 * library — carrying zero business/infra opinions of its own — doesn't own.
 *
 * Implemented as a global Nest interceptor rather than raw middleware:
 * unlike request-id and pino's access logging (both genuinely need to run
 * in Express's middleware phase, before routing), a span benefits from
 * wrapping the *handler* specifically, which is what an interceptor's
 * `next.handle()` call represents. It runs after pino-http has already
 * assigned req.id (see logging.module.ts) and is registered ahead of
 * MetricsInterceptor in PlatformModule's provider list, matching the
 * otel-then-metrics order from the plan.
 */
@Injectable()
export class OtelInterceptor implements NestInterceptor {
  constructor(@Inject(PLATFORM_SERVICE_NAME) private readonly serviceName: string) {}

  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (executionContext.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = executionContext.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const res = httpContext.getResponse<Response>();

    const tracer = trace.getTracer(this.serviceName);
    const span = tracer.startSpan(`${req.method} ${req.route?.path ?? req.path}`, {
      attributes: {
        'http.method': req.method,
        'http.target': req.originalUrl ?? req.url,
      },
    });

    req.traceId = span.spanContext().traceId;

    // The interceptor's own `tap` fires when the handler's observable
    // resolves, which happens *before* Nest's core writes the response
    // (and before an @HttpCode() decorator's status is applied) — reading
    // res.statusCode there would see Express's still-default 200 even for a
    // 201/204/etc. handler. `res.on('finish')` fires only once the response
    // has actually been flushed to the client, by which point the true
    // status code (success or one rewritten by an exception filter) is
    // final, so that's what ends the span; `tap`'s error branch only
    // records the exception detail onto it first, since that detail isn't
    // recoverable once the response has moved on to the filter.
    let ended = false;
    const endSpan = (): void => {
      if (ended) return;
      ended = true;
      span.setAttribute('http.status_code', res.statusCode);
      span.end();
    };
    res.once('finish', endSpan);
    res.once('close', endSpan);

    return context.with(trace.setSpan(context.active(), span), () =>
      next.handle().pipe(
        tap({
          error: (err: unknown) => {
            span.recordException(err instanceof Error ? err : new Error(String(err)));
            span.setStatus({ code: SpanStatusCode.ERROR });
          },
        }),
      ),
    );
  }
}
