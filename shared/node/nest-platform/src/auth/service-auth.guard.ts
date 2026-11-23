import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Request } from 'express-serve-static-core';
import { PlatformException } from '../errors/platform.exception';

/**
 * H3's authentication boundary for every Node service that receives
 * service-to-service calls: every request must carry a Keycloak
 * service-account JWT whose audience is this service's own resource client
 * (AUTH_AUDIENCE), and the route's declared client roles decide who may call
 * it. There is no unauthenticated path and no disable switch — the cluster
 * network is flat, and "the gateway stops the browsers" is not an answer to
 * "any pod can reach this port".
 *
 * The twin of core-ledger's Go middleware (core-ledger/internal/api/auth.go),
 * with the same shape of failure: missing/invalid token -> 401
 * {code: UNAUTHENTICATED}; a valid token whose resource_access carries none
 * of the route's roles -> 403 FORBIDDEN.
 *
 * The client roles this guard checks are the ones the receiver's own
 * bearer-only resource client defines (infra/keycloak/templates/
 * damp-realm.template.json, synced into a running Keycloak by
 * scripts/keycloak-sync.sh). One role per calling *service surface*, not per
 * route: the role answers "who is this caller", and the route's decorator
 * answers "what may that caller touch".
 *
 * Wiring (a service's app.module.ts):
 *
 *   providers: [{ provide: APP_GUARD, useClass: ServiceAuthGuard }],
 *
 * Config keys (validated at boot by each service's config class):
 *   AUTH_ISSUER_URL  the Keycloak realm issuer (OIDC discovery + JWKS)
 *   AUTH_AUDIENCE    this service's bearer-only resource client id
 *
 * Route marking:
 *   @RequireServiceRole('payments.ingest')  explicit roles (any one suffices)
 *   @Public()                               genuinely unauthenticated routes
 *   @HmacAuthenticated()                    the route verifies its own HMAC
 *                                           (workflow's decision callbacks);
 *                                           the guard skips JWT checks for it
 *
 * A controller/handler with no decorator defaults to `${AUTH_AUDIENCE}.
 * user-proxy` — the role only svc-bff holds, because asserting end-user
 * identity headers is exactly what that role is for.
 */

export const SERVICE_AUTH_PUBLIC = 'serviceAuth:public';
export const SERVICE_AUTH_HMAC = 'serviceAuth:hmac';
export const SERVICE_AUTH_ROLES = 'serviceAuth:roles';

/** @Public() marks a route that takes no service token (e.g. a rail callback
 * that already checks RAIL_CALLBACK_SECRET, or a health probe). */
export const Public = () => SetMetadata(SERVICE_AUTH_PUBLIC, true);

/** @HmacAuthenticated() marks a route that authenticates its caller with a
 * shared-secret signature instead of a JWT (workflow's decision callbacks).
 * The guard skips JWT verification; the route's own HMAC check stays. */
export const HmacAuthenticated = () => SetMetadata(SERVICE_AUTH_HMAC, true);

/** @RequireServiceRole(...roles) names the client roles (on this service's
 * own resource client) that authorize the route. Any one suffices. */
export const RequireServiceRole = (...roles: string[]) => SetMetadata(SERVICE_AUTH_ROLES, roles);

/** VerifiedServiceClaims is the token normalized down to what the platform
 * needs — deliberately narrow, so a handler can't accidentally depend on a
 * Keycloak-specific claim this package doesn't normalize. */
export interface VerifiedServiceClaims {
  /** azp — the client that obtained the token (e.g. svc-bff). */
  authorizedParty: string;
  /** resource_access.<client>.roles for every client that granted roles. */
  clientRoles: Record<string, string[]>;
}

/** ServiceAuthRequest is a Request whose auth state the guard has attached. */
export interface ServiceAuthRequest extends Request {
  serviceClaims?: VerifiedServiceClaims;
  /** The audience the token was verified against — this service's resource
   * client, and where the user-proxy role must be held. */
  serviceAudience?: string;
}

/** The probe and scraping routes platform.Health/metrics mount — the exact
 * counterparts of core-ledger's exemptPaths in api/auth.go. */
const EXEMPT_PATHS = new Set(['/healthz', '/readyz', '/version', '/metrics']);

/** Resolved once per process: OIDC discovery against AUTH_ISSUER_URL, then
 * the issuer's JWKS as an auto-rotating remote set. */
interface IssuerConfig {
  issuer: string;
  audience: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
}

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  private readonly issuer: string;
  private readonly audience: string;
  private resolved: Promise<IssuerConfig> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.issuer = this.config.get<string>('AUTH_ISSUER_URL', { infer: true }) ?? '';
    this.audience = this.config.get<string>('AUTH_AUDIENCE', { infer: true }) ?? '';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const controller = context.getClass();

    if (this.reflector.get<boolean>(SERVICE_AUTH_PUBLIC, handler) || this.reflector.get<boolean>(SERVICE_AUTH_PUBLIC, controller)) {
      return true;
    }
    if (this.reflector.get<boolean>(SERVICE_AUTH_HMAC, handler) || this.reflector.get<boolean>(SERVICE_AUTH_HMAC, controller)) {
      // The route authenticates its caller with its own shared-secret
      // signature; a JWT check here would be a second, wrong requirement.
      return true;
    }

    const req = context.switchToHttp().getRequest<ServiceAuthRequest>();
    if (EXEMPT_PATHS.has(req.path ?? '')) {
      return true;
    }

    // Authenticate before consulting roles, so an unauthenticated caller gets
    // the same 401 for every route and cannot map which routes exist.
    const token = bearerToken(req.headers.authorization);
    if (!token) {
      throw new PlatformException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'missing bearer token');
    }

    const resolved = await this.resolveIssuer();
    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(token, resolved.jwks, {
        issuer: resolved.issuer,
        audience: resolved.audience,
      });
      payload = verified.payload;
    } catch {
      throw new PlatformException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'invalid or expired token');
    }

    const claims = normalizeClaims(payload);
    req.serviceClaims = claims;
    req.serviceAudience = resolved.audience;

    const roles = this.requiredRoles(handler, controller);
    if (!roles.some((role) => claims.clientRoles[resolved.audience]?.includes(role))) {
      throw new PlatformException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'caller lacks the client role for this route');
    }
    return true;
  }

  /** The route's declared roles, or the user-proxy default: a route nobody
   * marked is a user-facing route, i.e. svc-bff's. The Function params are
   * @nestjs/core's own Reflector.get surface (handler/class), not anything
   * this package invents.
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private requiredRoles(handler: Function, controller: Function): string[] {
    const declared =
      this.reflector.get<string[]>(SERVICE_AUTH_ROLES, handler) ??
      this.reflector.get<string[]>(SERVICE_AUTH_ROLES, controller);
    return declared && declared.length > 0 ? declared : [`${this.audience}.user-proxy`];
  }

  /** Discovery + JWKS, resolved once and single-flight. Missing config fails
   * closed with 503: a service that cannot authenticate its callers must not
   * serve them — "no disable switch" is the whole point of this guard. */
  private resolveIssuer(): Promise<IssuerConfig> {
    if (!this.resolved) {
      this.resolved = this.discover().catch((err) => {
        // A failed discovery is not cached: retry on the next request, so a
        // Keycloak that was briefly down can be recovered from without a
        // process restart.
        this.resolved = null;
        throw err;
      });
    }
    return this.resolved;
  }

  private async discover(): Promise<IssuerConfig> {
    if (!this.issuer || !this.audience) {
      throw new PlatformException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'AUTH_NOT_CONFIGURED',
        'AUTH_ISSUER_URL/AUTH_AUDIENCE are not set; refusing to serve without authentication',
      );
    }
    const configUrl = `${this.issuer}/.well-known/openid-configuration`;
    let jwksUri: string;
    try {
      const res = await fetch(configUrl, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        throw new Error(`discovery returned ${res.status}`);
      }
      const discovery = (await res.json()) as { jwks_uri?: string };
      if (!discovery.jwks_uri) {
        throw new Error('discovery document has no jwks_uri');
      }
      jwksUri = discovery.jwks_uri;
    } catch (err) {
      throw new PlatformException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'AUTH_ISSUER_UNREACHABLE',
        `OIDC discovery against ${this.issuer} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return {
      issuer: this.issuer,
      audience: this.audience,
      jwks: createRemoteJWKSet(new URL(jwksUri)),
    };
  }
}

/** bearerToken extracts the token from an Authorization header ("Bearer
 * <token>"), or returns '' when the header carries none — the Node twin of
 * oidcverify.BearerToken. */
export function bearerToken(header: string | undefined): string {
  if (!header) return '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return '';
  return header.slice(prefix.length).trim();
}

/** normalizeClaims reduces a verified payload to VerifiedServiceClaims,
 * flattening Keycloak's resource_access shape. */
export function normalizeClaims(payload: JWTPayload): VerifiedServiceClaims {
  const raw = (payload.resource_access ?? {}) as Record<string, { roles?: unknown }>;
  const clientRoles: Record<string, string[]> = {};
  for (const [client, access] of Object.entries(raw)) {
    if (Array.isArray(access?.roles)) {
      clientRoles[client] = access.roles.filter((r): r is string => typeof r === 'string');
    }
  }
  return {
    authorizedParty: typeof payload.azp === 'string' ? payload.azp : '',
    clientRoles,
  };
}
