import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express-serve-static-core';
import { AuditRequest } from './audit-event';

/**
 * The request facts an audit event carries.
 *
 * `requestId` is pino-http's req.id — the inbound X-Request-Id when the
 * gateway set one — which is what ties an audit event to the same request in
 * every service's logs. X-Roles is trusted for the reason X-User-Id is
 * everywhere on this platform: Traefik strips it inbound and only auth-proxy
 * sets it. The source IP prefers the first X-Forwarded-For hop, because
 * behind the gateway the socket address is the gateway's, on every request.
 */
export function auditRequestFrom(req: Request): AuditRequest {
  const header = (name: string): string | undefined => {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const forwarded = header('x-forwarded-for')?.split(',')[0]?.trim();
  const roles = (header('x-roles') ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r !== '');
  return {
    requestId: req.id ?? header('x-request-id'),
    sourceIp: forwarded || req.ip || req.socket?.remoteAddress,
    userAgent: header('user-agent'),
    roles: roles.length > 0 ? roles : undefined,
  };
}

/** `@AuditContext() audit: AuditRequest` in a controller method. */
export const AuditContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuditRequest => {
  return auditRequestFrom(ctx.switchToHttp().getRequest<Request>());
});
