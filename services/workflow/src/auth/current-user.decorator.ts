import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PlatformException } from '@damp/nest-platform';
import type { Request } from 'express-serve-static-core';

/**
 * Who is acting, as services/auth-proxy resolved it: X-User-Id and X-Roles.
 *
 * Trusted unconditionally, for exactly the reason bff's own version of this
 * decorator documents: these are ForwardAuth's authResponseHeaders, which
 * Traefik deletes from the inbound request and replaces with auth-proxy's
 * answer, so by the time one reaches this service it can only have been set
 * by auth-proxy (and carried here unchanged by bff's UpstreamProxy).
 * Re-verifying the token here would duplicate auth-proxy's job and let the
 * two drift.
 *
 * Unlike payments, workflow does make an authorization decision of its own —
 * whether this person holds one of the roles a policy names — and that
 * decision is only as good as where the roles come from. They come from here
 * and nowhere else; the request body is the caller's assertion, not the
 * gateway's. See RequestsController.refuseClaimedRoles.
 */
export interface Actor {
  userId: string;
  roles: string[];
}

export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const userId = req.headers['x-user-id'];

  if (typeof userId !== 'string' || userId === '') {
    throw new PlatformException(
      401,
      'MISSING_IDENTITY',
      'X-User-Id header missing — is this request going through the gateway?',
    );
  }
  return { userId, roles: gatewayRoles(req) };
});

/**
 * X-Roles as auth-proxy writes it: strings.Join(claims.Roles, ","). Trimmed
 * and de-blanked so an empty header is no roles rather than one role named
 * "" — a policy never names "", but the check should not depend on that.
 */
function gatewayRoles(req: Request): string[] {
  const value = req.headers['x-roles'];
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '');
  return raw
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r !== '');
}

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
