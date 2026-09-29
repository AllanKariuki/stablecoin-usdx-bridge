import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PlatformException } from '@damp/nest-platform';
import type { Request } from 'express-serve-static-core';

/**
 * The party id services/auth-proxy resolved, taken from X-User-Id.
 *
 * Trusted unconditionally, for exactly the reason bff's own version of this
 * decorator documents: Traefik strips these headers from the inbound request
 * (customRequestHeaders with empty values) before ForwardAuth runs, so by the
 * time one reaches this service it can only have been set by auth-proxy.
 * Re-verifying the token here would duplicate auth-proxy's job and let the two
 * drift.
 *
 * This returns the bare id rather than bff's richer AuthContext because
 * payments never makes an authorization decision of its own — the gateway's
 * route table does that — and a decorator that returned roles would invite
 * one to be made here.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const userId = req.headers['x-user-id'];

  if (typeof userId !== 'string' || userId === '') {
    throw new PlatformException(
      401,
      'MISSING_IDENTITY',
      'X-User-Id header missing — is this request going through the gateway?',
    );
  }
  return userId;
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
