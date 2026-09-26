import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express-serve-static-core';
import { ErrorResponse } from './error-response.interface';

/**
 * ErrorEnvelopeFilter guarantees the {error, code, request_id} envelope for
 * literally every error response — including ones the handler layer never
 * touched, like Nest's own 404 (unmatched route) or a raw thrown value that
 * isn't even an Error. Direct counterpart of shared/go/platform/envelope.go's
 * ErrorHandler.
 *
 * `@Catch()` with no argument makes this Nest's catch-all exception filter:
 * registered globally (see PlatformModule), it is the terminal point every
 * thrown error in the Nest-managed request pipeline (guards, pipes,
 * interceptors, controllers) funnels through — this library's structural
 * equivalent of fiber's recover.New() plus its ErrorHandler combined. One
 * genuine architectural gap this doesn't cover: a synchronous throw truly
 * outside Nest's own request lifecycle (e.g. inside a raw Express middleware
 * that doesn't forward to `next(err)`) can still crash the Node process,
 * since Node has no per-request goroutine to recover from under it the way
 * Go does. Every middleware/interceptor this package installs is written to
 * avoid that gap explicitly.
 */
@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL';
    let message = 'internal error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
      code = status === HttpStatus.NOT_FOUND ? 'NOT_FOUND' : 'REQUEST_ERROR';

      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        if (typeof b.message === 'string') {
          message = b.message;
        } else if (Array.isArray(b.message)) {
          message = b.message.join(', ');
        }
        // PlatformException (or any handler-thrown HttpException) carrying
        // an explicit `code` wins over the generic REQUEST_ERROR/NOT_FOUND
        // mapping — this is what makes PlatformException's `code` argument
        // actually reach the envelope.
        if (typeof b.code === 'string') {
          code = b.code;
        }
      }
    }

    const envelope: ErrorResponse = {
      error: message,
      code,
      request_id: req?.id ?? '',
    };
    res.status(status).json(envelope);
  }
}
