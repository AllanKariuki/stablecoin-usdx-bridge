import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express-serve-static-core';

/**
 * The permissions auth-proxy resolved, from X-Permissions.
 *
 * Trusted for the same reason X-User-Id is: Traefik strips these headers from
 * the inbound request before ForwardAuth runs, so by the time one reaches a
 * service it can only have been set by auth-proxy.
 *
 * This matters more here than elsewhere. These permissions decide the
 * row-level security clause on a Superset guest token — the entire access
 * control for an embedded dashboard — so reading them from a request body
 * would be letting the caller choose what they can see.
 */
export const Permissions = createParamDecorator((_data: unknown, ctx: ExecutionContext): string[] => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const header = req.headers['x-permissions'];
  if (typeof header !== 'string' || header === '') return [];
  return header.split(',');
});
