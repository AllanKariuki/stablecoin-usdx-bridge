import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PlatformException, ServiceAuthRequest, serviceIdentityFrom } from '@damp/nest-platform';
import type { Request } from 'express-serve-static-core';

/**
 * The party id services/auth-proxy resolved, taken from X-User-Id.
 *
 * Since H3 that header is no longer trusted on the strength of the network
 * alone: the shared serviceIdentityFrom only releases it when the request's
 * verified service token holds payments.user-proxy — the role granted to
 * svc-bff and nothing else — so a caller with any other role cannot assert
 * an end-user identity. The 401 for a missing X-User-Id keeps the same
 * MISSING_IDENTITY code handlers and tests already expect.
 *
 * This returns the bare id rather than bff's richer AuthContext because
 * payments never makes an authorization decision of its own — the gateway's
 * route table does that — and a decorator that returned roles would invite
 * one to be made here.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<ServiceAuthRequest>();
  return serviceIdentityFrom(req).userId;
});

/**
 * The client's Idempotency-Key, required on every write that moves money.
 *
 * Generating one server-side would defeat the point, the same way it would in
 * core-ledger's own handlers: the guarantee only holds if the *client* sends
 * the same key when it retries.
 */
export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const key = req.headers['idempotency-key'];

  if (typeof key !== 'string' || key === '') {
    throw new PlatformException(
      400,
      'MISSING_IDEMPOTENCY_KEY',
      'an Idempotency-Key header is required on every write, and must be reused when retrying',
    );
  }
  return key;
});
