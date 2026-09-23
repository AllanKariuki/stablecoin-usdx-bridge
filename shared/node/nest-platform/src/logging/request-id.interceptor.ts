import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Request, Response } from 'express-serve-static-core';
import { REQUEST_ID_HEADER } from '../constants';

/**
 * RequestIdInterceptor echoes the request id onto the response header — the
 * counterpart of fiber's requestid.New(), minus generating the id itself.
 *
 * The id's actual source of truth is pino-http's `genReqId` (configured in
 * PlatformLoggingModule to propagate an inbound x-request-id or mint one via
 * crypto.randomUUID()), not a separate earlier-in-the-chain middleware, for
 * a concrete reason: Nest applies module-registered Express middleware
 * (NestModule#configure) in an order governed by the module dependency
 * graph, not simple import-array position — nestjs-pino's own LoggerModule
 * also implements `configure()` to install pino-http, and empirically it
 * runs *before* a sibling middleware registered by a module that merely
 * imports it, so a separately-registered "assign req.id first" middleware
 * would sometimes lose that race and produce two different ids for the same
 * request (one pino logged, a different one every other layer saw). Making
 * pino-http itself the single generator removes the race instead of trying
 * to win it. Every layer after Express's middleware phase — this
 * interceptor, OtelInterceptor, MetricsInterceptor, ErrorEnvelopeFilter — is
 * guaranteed to run after pino-http's middleware has already set req.id,
 * since Nest interceptors/filters execute strictly after the Express
 * middleware phase completes; this interceptor's only job is echoing that
 * already-settled id onto the response header.
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (executionContext.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = executionContext.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const res = httpContext.getResponse<Response>();

    if (req.id && !res.headersSent) {
      res.setHeader(REQUEST_ID_HEADER, req.id);
    }

    return next.handle();
  }
}
