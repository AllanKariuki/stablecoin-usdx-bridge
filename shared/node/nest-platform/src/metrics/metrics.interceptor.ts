import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express-serve-static-core';
import { Observable } from 'rxjs';
import { PlatformMetricsService } from './metrics.service';

/**
 * MetricsInterceptor is the last link in the platform chain (see
 * shared/go/platform/middleware.go's Chain doc comment), recording one
 * observation per request keyed by the *matched route pattern* — not the
 * raw path — so `/wallets/:id` doesn't explode the cardinality of every
 * wallet id ever requested. `req.route.path` is Express's own matched-route
 * pattern, populated by the time Nest's interceptor layer runs (interceptors
 * execute from inside the route handler Nest registers with Express, i.e.
 * strictly after Express's router has already matched and set it) —
 * unmatched requests (Nest's own 404) never reach an interceptor at all, so
 * there's no "unmatched" fallback path to cover here the way Go's fiber
 * version needs one.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: PlatformMetricsService) {}

  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (executionContext.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = executionContext.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const res = httpContext.getResponse<Response>();

    const start = process.hrtime.bigint();
    this.metrics.incInFlight();

    let recorded = false;
    const record = (): void => {
      if (recorded) return;
      recorded = true;
      this.metrics.decInFlight();

      const route = req.route?.path ?? req.path;
      const status = String(res.statusCode);
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.observe(req.method, route, status, seconds);
    };
    res.once('finish', record);
    res.once('close', record);

    return next.handle();
  }
}
