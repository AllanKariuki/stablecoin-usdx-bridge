import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformException, ServiceTokenClient } from '@damp/nest-platform';
import { KeycloakGroup, KeycloakUser } from './keycloak-admin.types';

/**
 * A hand-rolled client over the exact 3 Keycloak Admin API calls
 * services/identity needs (client-credentials token, get-user, get-user's-
 * groups) — matching bff's CoreLedgerClient in spirit
 * (services/bff/src/core-ledger/core-ledger.client.ts): a thin fetch
 * wrapper, not the full @keycloak/keycloak-admin-client SDK, for a surface
 * this small. Authenticates as the "identity-service" confidential client
 * already provisioned in infra/keycloak/realms/damp-realm.json.
 *
 * H2: the token itself now comes from the shared ServiceTokenClient — the
 * same instance identity's CoreLedgerClient uses for its core-ledger calls,
 * so the service holds exactly one client-credentials cache.
 */
@Injectable()
export class KeycloakAdminClient {
  private readonly baseUrl: string;
  private readonly realm: string;

  constructor(
    config: ConfigService,
    private readonly serviceTokens: ServiceTokenClient,
  ) {
    this.baseUrl = config.get<string>('KEYCLOAK_BASE_URL', { infer: true })!;
    this.realm = config.get<string>('KEYCLOAK_REALM', { infer: true })!;
  }

  getUser(subject: string): Promise<KeycloakUser> {
    return this.request<KeycloakUser>(`/admin/realms/${this.realm}/users/${encodeURIComponent(subject)}`);
  }

  getUserGroups(subject: string): Promise<KeycloakGroup[]> {
    return this.request<KeycloakGroup[]>(`/admin/realms/${this.realm}/users/${encodeURIComponent(subject)}/groups`);
  }

  private async request<T>(path: string): Promise<T> {
    const accessToken = await this.serviceTokens.accessToken();

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
