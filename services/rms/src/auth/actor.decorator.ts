import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express-serve-static-core';

/**
 * Who is changing a reconciliation input, for the audit trail: the party id
 * auth-proxy resolved (X-User-Id), trusted for the reason it is everywhere
 * on this platform — Traefik strips it inbound and only auth-proxy sets it.
 *
 * Unlike payments' CurrentUser this does not refuse a request without one.
 * rms has no gateway route yet and its README's drift demo is a curl from
 * inside the cluster, so a hard 401 would break the one way it is operated
 * today. Such a change is recorded as UNATTRIBUTED instead — visible in the
 * trail as exactly what it is, rather than silently attributed to "rms".
 */
export const UNATTRIBUTED = 'unattributed';

export const Actor = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const userId = ctx.switchToHttp().getRequest<Request>().headers['x-user-id'];
  return typeof userId === 'string' && userId !== '' ? userId : UNATTRIBUTED;
});
