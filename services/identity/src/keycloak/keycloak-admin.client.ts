import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformException } from '@damp/nest-platform';
import { KeycloakGroup, KeycloakUser } from './keycloak-admin.types';

/**
 * A hand-rolled client over the exact 3 Keycloak Admin API calls
 * services/identity needs (client-credentials token, get-user, get-user's-
 * groups) — matching bff's CoreLedgerClient in spirit
 * (services/bff/src/core-ledger/core-ledger.client.ts): a thin fetch
 * wrapper, not the full @keycloak/keycloak-admin-client SDK, for a surface
 * this small. Authenticates as the "identity-service" confidential client
 * already provisioned in infra/keycloak/realms/damp-realm.json.
 */
@Injectable()
export class KeycloakAdminClient {
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  private cachedToken?: { accessToken: string; expiresAt: number };

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('KEYCLOAK_BASE_URL', { infer: true })!;
    this.realm = config.get<string>('KEYCLOAK_REALM', { infer: true })!;
    this.clientId = config.get<string>('KEYCLOAK_ADMIN_CLIENT_ID', { infer: true })!;
    this.clientSecret = config.get<string>('KEYCLOAK_ADMIN_CLIENT_SECRET', { infer: true })!;
  }

  getUser(subject: string): Promise<KeycloakUser> {
    return this.request<KeycloakUser>(`/admin/realms/${this.realm}/users/${encodeURIComponent(subject)}`);
  }

  getUserGroups(subject: string): Promise<KeycloakGroup[]> {
    return this.request<KeycloakGroup[]>(`/admin/realms/${this.realm}/users/${encodeURIComponent(subject)}/groups`);
  }

  private async token(): Promise<string> {
    const now = Date.now();
    // 5s safety margin so a token that's about to expire mid-request still
    // gets refreshed rather than failing on the far side.
    if (this.cachedToken && this.cachedToken.expiresAt > now + 5000) {
      return this.cachedToken.accessToken;
    }

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
        502,
        'KEYCLOAK_UNREACHABLE',
        `keycloak token request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      throw new PlatformException(
        502,
        'KEYCLOAK_AUTH_FAILED',
        `keycloak client-credentials grant returned ${response.status}`,
      );
    }

    const parsed = (await response.json()) as { access_token: string; expires_in: number };
    this.cachedToken = { accessToken: parsed.access_token, expiresAt: now + parsed.expires_in * 1000 };
    return parsed.access_token;
  }

  private async request<T>(path: string): Promise<T> {
    const accessToken = await this.token();

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      throw new PlatformException(
        502,
        'KEYCLOAK_UNREACHABLE',
        `keycloak request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      throw new PlatformException(
        response.status,
        'KEYCLOAK_ERROR',
        `keycloak returned ${response.status} for ${path}`,
      );
    }
    return (await response.json()) as T;
  }
}
