import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PlatformException } from '@damp/nest-platform';
import type { Request } from 'express-serve-static-core';

/**
 * AuthContext is exactly what services/auth-proxy's ForwardAuth response
 * puts on the request — see services/auth-proxy/internal/api/handler.go's
 * X-User-Id/X-Org-Id/X-Roles/X-Permissions headers and
 * infra/traefik/dynamic.yaml's authResponseHeaders. bff trusts these
 * headers unconditionally: Traefik strips them from the original inbound
 * request (customRequestHeaders with empty values) before ForwardAuth ever
 * runs, so by the time a request reaches bff, these can only have been set
 * by auth-proxy itself — see docs/building-plan.md's P1 note on why that
 * stripping is what makes trusting them here safe. bff never re-verifies
 * the token; that would duplicate auth-proxy's job and let the two drift.
 */
export interface AuthContext {
  userId: string;
  orgId: string;
  roles: string[];
  permissions: string[];
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const userId = req.headers['x-user-id'];

  if (typeof userId !== 'string' || userId === '') {
    // Only reachable if bff is somehow called directly, bypassing Traefik/
    // auth-proxy (e.g. a misconfigured local dev run) — a real deployment
    // never reaches this branch, since auth-proxy's route table denies
    // anything it hasn't verified before bff ever sees the request.
    throw new PlatformException(401, 'MISSING_IDENTITY', 'X-User-Id header missing — is this request going through the gateway?');
  }

  return {
    userId,
    orgId: headerString(req, 'x-org-id'),
    roles: splitHeader(req, 'x-roles'),
    permissions: splitHeader(req, 'x-permissions'),
  };
});

function headerString(req: Request, name: string): string {
  const value = req.headers[name];
  return typeof value === 'string' ? value : '';
}

function splitHeader(req: Request, name: string): string[] {
  const value = headerString(req, name);
  return value === '' ? [] : value.split(',');
}
