import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformException } from '../errors/platform.exception';

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * ServiceTokenClient mints and caches a Keycloak client-credentials token
 * for the process's own service account — the shared way every Node service
 * authenticates its service-to-service calls after H2 (core-ledger requires
 * a service-account JWT whose client role authorizes the route; see
 * core-ledger/internal/api/auth.go and infra/keycloak/templates/
 * damp-realm.template.json).
 *
 * Config keys (all read at boot via PlatformConfigModule):
 *   SERVICE_CLIENT_ID     the confidential client id (e.g. svc-bff)
 *   SERVICE_CLIENT_SECRET its secret
 *   KEYCLOAK_BASE_URL     http://localhost:8080
 *   KEYCLOAK_REALM        damp
 *
 * The token is cached until 30s before expiry and refreshes are
 * single-flight: N concurrent callers of accessToken() during a refresh
 * share one token request instead of hammering the token endpoint N times.
 * Failures are typed PlatformExceptions, so a caller that must not lose a
 * retry can distinguish "keycloak unreachable" (retryable) from "grant
 * refused" (misconfiguration, will not fix itself) — the same discipline
 * payments' LedgerError applies to core-ledger responses.
 */
@Injectable()
export class ServiceTokenClient {
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  private cached?: CachedToken;
  private refreshing?: Promise<CachedToken>;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('KEYCLOAK_BASE_URL', { infer: true })!;
    this.realm = config.get<string>('KEYCLOAK_REALM', { infer: true }) ?? 'damp';
    this.clientId = config.get<string>('SERVICE_CLIENT_ID', { infer: true })!;
    this.clientSecret = config.get<string>('SERVICE_CLIENT_SECRET', { infer: true })!;
  }

  /** The service account's access token, fetched on first use and refreshed. */
  accessToken(): Promise<string> {
    const now = Date.now();
    // 30s safety margin so a token that is about to expire mid-request gets
    // refreshed rather than failing on the far side.
    if (this.cached && this.cached.expiresAt > now + 30_000) {
      return Promise.resolve(this.cached.accessToken);
    }

    if (!this.refreshing) {
      this.refreshing = this.fetchToken(now).finally(() => {
        this.refreshing = undefined;
      });
    }
    return this.refreshing.then((token) => token.accessToken);
  }

  private async fetchToken(now: number): Promise<CachedToken> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (err) {
      throw new PlatformException(
        HttpStatus.BAD_GATEWAY,
        'KEYCLOAK_UNREACHABLE',
        `keycloak token request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      throw new PlatformException(
        HttpStatus.BAD_GATEWAY,
        'KEYCLOAK_AUTH_FAILED',
        `keycloak client-credentials grant returned ${response.status}`,
      );
    }

    const parsed = (await response.json()) as TokenResponse;
    const token = { accessToken: parsed.access_token, expiresAt: now + parsed.expires_in * 1000 };
    this.cached = token;
    return token;
  }
}
