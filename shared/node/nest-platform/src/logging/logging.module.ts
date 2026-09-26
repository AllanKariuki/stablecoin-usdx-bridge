import { DynamicModule, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express-serve-static-core';
import { REQUEST_ID_HEADER } from '../constants';
// src/types/express-augmentation.d.ts augments express-serve-static-core's
// Request with `id`/`traceId` globally once it's part of the program (via
// tsconfig's include glob) — no explicit import needed here.

export interface PlatformLoggingOptions {
  service: string;
  /** pino level name: 'debug' | 'info' | 'warn' | 'error' | ... Defaults to 'info'. */
  level?: string;
}

/**
 * PlatformLoggingModule wires nestjs-pino as the direct Node equivalent of
 * shared/go/platform/logging.go's NewLogger: pino's default transport is
 * already newline-delimited JSON to stdout (the same shape slog.NewJSONHandler
 * produces), `base: { service }` tags every line the same way Go's
 * `.With(slog.String("service", service))` does, and pino-http's built-in
 * access logging is the one-JSON-line-per-request access logger, with
 * request_id/trace_id attached per line via `customProps`.
 *
 * `genReqId` is the single source of truth for the request id — propagating
 * an inbound x-request-id or minting one via crypto.randomUUID() — rather
 * than a separate earlier "requestid" middleware setting `req.id` first for
 * pino-http to read. See RequestIdInterceptor's doc comment for why: Nest's
 * cross-module middleware ordering isn't reliably controllable, and having
 * two different things independently try to assign the id is exactly what
 * produced two different ids for the same request in practice. Everything
 * downstream (RequestIdInterceptor, OtelInterceptor, MetricsInterceptor,
 * ErrorEnvelopeFilter) reads the one id pino-http already settled on.
 *
 * For the Go side's WithLogger/LoggerFromContext (threading a request-scoped,
 * already-tagged logger through context instead of re-deriving it at every
 * call site): nestjs-pino's own `PinoLogger` (and the `Logger` class it
 * exports, usable via `app.useLogger`) already solve this via an internal
 * AsyncLocalStorage-backed request scope — inject `PinoLogger` anywhere in
 * the call graph and it carries the current request's bindings automatically.
 * This module re-exports both from '@damp/nest-platform' rather than
 * reinventing that mechanism.
 */
@Module({})
export class PlatformLoggingModule {
  static forRoot(options: PlatformLoggingOptions): DynamicModule {
    return {
      module: PlatformLoggingModule,
      imports: [
        PinoLoggerModule.forRoot({
          pinoHttp: {
            level: options.level ?? 'info',
            base: { service: options.service },
            genReqId: (req: Request) => (req.headers[REQUEST_ID_HEADER] as string | undefined) || randomUUID(),
            customProps: (req: Request) => ({
              request_id: req.id,
              trace_id: req.traceId ?? '',
            }),
            customLogLevel: (_req: Request, res: Response, err?: Error) => {
              if (err || res.statusCode >= 500) return 'error';
              if (res.statusCode >= 400) return 'warn';
              return 'info';
            },
          },
        }),
      ],
      exports: [PinoLoggerModule],
    };
  }
}
