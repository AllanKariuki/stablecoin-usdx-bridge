import type { Request } from 'express-serve-static-core';

/**
 * traceIdFrom returns the current request's trace id (set by
 * OtelInterceptor), or "" if tracing middleware wasn't installed or the
 * no-op TracerProvider yielded an all-zero id — the same fallback shared/go/platform's
 * TraceID(c) uses.
 */
export function traceIdFrom(req: Request): string {
  return req.traceId ?? '';
}
