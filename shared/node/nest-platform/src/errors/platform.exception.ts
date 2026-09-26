import { HttpException } from '@nestjs/common';

/**
 * PlatformException is the Nest equivalent of shared/go/platform/envelope.go's
 * `WriteError(c, status, code, message)` helper: throw one of these anywhere
 * in a handler/service to control the exact `code` the {error, code, request_id}
 * envelope reports, the same way Go handlers call
 * `platform.WriteError(c, fiber.StatusConflict, "ACCOUNT_FROZEN", "wallet is frozen")`.
 *
 *   throw new PlatformException(HttpStatus.CONFLICT, 'ACCOUNT_FROZEN', 'wallet is frozen');
 *
 * A plain HttpException (or any built-in Nest exception like NotFoundException)
 * still works and still produces the envelope — ErrorEnvelopeFilter falls
 * back to a generic REQUEST_ERROR/NOT_FOUND code for those, matching
 * shared/go/platform's ErrorHandler, which applies the same generic mapping
 * to any *fiber.Error that isn't constructed through WriteError.
 */
export class PlatformException extends HttpException {
  constructor(status: number, code: string, message: string) {
    super({ code, message }, status);
  }
}
