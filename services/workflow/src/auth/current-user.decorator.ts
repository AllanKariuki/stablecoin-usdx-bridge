import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PlatformException, ServiceAuthRequest, serviceIdentityFrom } from '@damp/nest-platform';
import type { Request } from 'express-serve-static-core';

/**
 * Who is acting, as services/auth-proxy resolved it: X-User-Id and X-Roles.
 *
 * Since H3 those headers are no longer trusted on the strength of the
 * network alone. The shared serviceIdentityFrom only releases them when the
 * request's verified service token holds workflow.user-proxy — the role
 * granted to svc-bff and nothing else — and that is the only path whose
 * roles ever authorize a policy check (humans approving through the
 * gateway).
 *
 * The one deliberate exception is workflow.propose: kyc and compliance call
 * POST /approval-requests with that role, forwarding as X-User-Id the
 * gateway identity of the officer whose action they are proposing. That
 * identity is AUDIT-ONLY — it is recorded as requested_by, never checked
 * against a policy (a proposer never decides; see RequestsService) — so this
 * decorator reads the header for a propose-role caller but returns no roles
 * from it, making "audit-only" a property of the returned value rather than
 * a comment the next edit can forget.
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
  const req = ctx.switchToHttp().getRequest<ServiceAuthRequest>();
  const audience = req.serviceAudience ?? 'workflow';
  const roles = req.serviceClaims?.clientRoles[audience] ?? [];

  if (roles.includes('workflow.user-proxy')) {
    const identity = serviceIdentityFrom(req);
    return { userId: identity.userId, roles: identity.roles };
  }
  if (roles.includes('workflow.propose')) {
    // The proposer's header is audit-only: recorded, never authorized.
    const header = req.headers['x-user-id'];
    const userId = Array.isArray(header) ? header[0] : header;
    return { userId: typeof userId === 'string' && userId !== '' ? userId : `service:${req.serviceClaims?.authorizedParty ?? ''}`, roles: [] };
  }

  throw new PlatformException(
    401,
    'MISSING_IDENTITY',
    'no verified service token with workflow.user-proxy or workflow.propose on this request',
  );
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
