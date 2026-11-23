import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenClient } from '@damp/nest-platform';
import { IncomingMessage } from 'node:http';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Verifies the token on a WebSocket upgrade.
 *
 * This is the one place in the platform that verifies a JWT outside
 * services/auth-proxy, and it exists for a reason that cannot be designed
 * around: a browser cannot set an `Authorization` header on
 * `new WebSocket(url)`. There is no header for Traefik's ForwardAuth to
 * inspect, so the token travels as a query parameter and is verified here.
 *
 * The verification is deliberately narrower than auth-proxy's: it establishes
 * *who* is connecting and nothing else. No permissions are expanded and no
 * route table is consulted, because the socket is a fan-out and a client can
 * take no action over it — see WsGateway.onMessage, which accepts only a
 * ping. Everything a user can actually do goes over HTTP, through the
 * gateway, where the permission model lives.
 *
 * Since H3 there is no unverified mode: a missing or unverifiable token means
 * the upgrade is refused with 401. The single escape hatch is
 * NOTIFICATIONS_WS_DEV_AUTH=true with ENV=local, which accepts the
 * unverified partyId query parameter the old client sent — a dev-only
 * convenience, loudly warned about at boot, never acceptable anywhere real.
 */
@Injectable()
export class WsAuth {
  private readonly logger = new Logger(WsAuth.name);
  private readonly issuer: string;
  private readonly audience: string;
  private readonly identityUrl: string;
  private readonly devAuth: boolean;
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(
    config: ConfigService,
    private readonly serviceTokens: ServiceTokenClient,
  ) {
    this.issuer = config.get<string>('KEYCLOAK_ISSUER_URL', { infer: true }) ?? '';
    this.audience = config.get<string>('OIDC_AUDIENCE', { infer: true }) ?? 'damp-portal';
    this.identityUrl = config.get<string>('IDENTITY_SERVICE_URL', { infer: true }) ?? '';
    this.devAuth = config.get<string>('ENV', { infer: true }) === 'local' &&
      config.get<boolean>('NOTIFICATIONS_WS_DEV_AUTH', { infer: true }) === true;

    if (!this.issuer) {
      if (this.devAuth) {
        this.logger.warn(
          'KEYCLOAK_ISSUER_URL is unset and NOTIFICATIONS_WS_DEV_AUTH=true (ENV=local): websocket ' +
            'connections are NOT authenticated. A party id supplied by the client is taken at face value.',
        );
      } else {
        this.logger.error(
          'KEYCLOAK_ISSUER_URL is unset: every websocket upgrade will be refused. ' +
            'There is no unauthenticated fallback outside the explicit dev opt-in.',
        );
      }
    } else {
      const jwksUrl =
        config.get<string>('KEYCLOAK_JWKS_URL', { infer: true }) || `${this.issuer}/protocol/openid-connect/certs`;
      this.jwks = createRemoteJWKSet(new URL(jwksUrl));
    }
  }

  async resolve(req: IncomingMessage): Promise<string | null> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const token = url.searchParams.get('token') ?? '';

    if (!this.jwks) {
      if (this.devAuth) {
        return url.searchParams.get('partyId') || 'dev-user';
      }
      return null; // refuse: no verifier and no dev opt-in
    }

    if (!token) return null;

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      });
      const subject = typeof payload.sub === 'string' ? payload.sub : '';
      if (!subject) return null;
      return this.toPartyId(subject);
    } catch (err) {
      this.logger.debug(`websocket token rejected: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Keycloak's `sub` is not the party id. core-ledger's wallets.user_id is
   * the *party* id, and the mapping between them is services/identity's to
   * own — see the plan's "Identity is three layers" decision. The lookup
   * carries notifications' own service token (identity.resolve) since H3.
   * Falling back to the raw subject when identity is unreachable mirrors
   * auth-proxy's own SubjectPassthroughResolver.
   */
  private async toPartyId(subject: string): Promise<string> {
    if (!this.identityUrl) return subject;
    try {
      const res = await fetch(new URL(`/internal/parties/by-subject/${encodeURIComponent(subject)}`, this.identityUrl), {
        headers: { Authorization: `Bearer ${await this.serviceTokens.accessToken()}` },
      });
      if (!res.ok) return subject;
      const body = (await res.json()) as { id?: string };
      return body.id ?? subject;
    } catch {
      return subject;
    }
  }
}
