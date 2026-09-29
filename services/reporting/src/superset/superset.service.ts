import { ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface GuestTokenResponse {
  token: string;
}

/**
 * Minting Superset guest tokens, server-side.
 *
 * **This exists to fix a real hole.** `frontend/src/services/supersetService.ts`
 * called `POST /api/v1/security/guest_token/` *from the browser* — and that
 * endpoint requires a Superset **admin** bearer token. Either the frontend
 * was sending admin credentials to the browser, or the call had never
 * worked. Both are bad, and the second is how it survived: nothing in the app
 * rendered a dashboard, so nothing surfaced the failure.
 *
 * Guest tokens are minted here, where the admin credential lives, and handed
 * to a browser that has already been authenticated by the gateway.
 *
 * The other half is row-level security. A guest token carries RLS clauses
 * that Superset applies to every query the embedded dashboard runs — so a
 * customer embedding their own dashboard sees their own rows and nobody
 * else's, enforced by the analytics database rather than by the dashboard
 * being careful. Issuing a token *without* a clause for a caller who only
 * holds a `:own` permission would expose every customer's activity to any of
 * them, which is why `rlsFor` refuses rather than defaulting to none.
 */
@Injectable()
export class SupersetService {
  private readonly logger = new Logger(SupersetService.name);

  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;

  /** Cached, because it lasts an hour and a login per dashboard load is a round trip nobody needs. */
  private adminToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>('SUPERSET_URL', { infer: true }) ?? '').replace(/\/$/, '');
    this.username = this.config.get<string>('SUPERSET_ADMIN_USERNAME', { infer: true }) ?? '';
    this.password = this.config.get<string>('SUPERSET_ADMIN_PASSWORD', { infer: true }) ?? '';
  }

  get configured(): boolean {
    return Boolean(this.baseUrl && this.username && this.password);
  }

  /**
   * Issues a guest token for one dashboard.
   *
   * `permissions` are the caller's, as resolved by auth-proxy — not asserted
   * by the request. They decide the RLS clauses, which is the entire access
   * control for the embedded dashboard.
   */
  async guestToken(input: {
    dashboardId: string;
    partyId: string;
    permissions: string[];
    displayName?: string;
  }): Promise<{ token: string; supersetUrl: string; expiresInSeconds: number }> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Superset is not configured in this environment (SUPERSET_URL / SUPERSET_ADMIN_USERNAME / SUPERSET_ADMIN_PASSWORD)',
      );
    }

    const rls = this.rlsFor(input.partyId, input.permissions);

    const admin = await this.adminAccessToken();
    const res = await fetch(new URL('/api/v1/security/guest_token/', this.baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: {
          // The party id, not an email: the dashboard's audit log should name
          // the same identity everything else in this platform does.
          username: input.partyId,
          first_name: input.displayName ?? input.partyId,
          last_name: '',
        },
        resources: [{ type: 'dashboard', id: input.dashboardId }],
        rls,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Superset refused a guest token: ${res.status} ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException('Superset could not issue a guest token');
    }

    const body = (await res.json()) as GuestTokenResponse;
    return {
      token: body.token,
      supersetUrl: this.baseUrl,
      // Superset's default. Returned so the frontend can refresh before
      // expiry rather than discovering it mid-session with a blank iframe.
      expiresInSeconds: 300,
    };
  }

  /**
   * The row-level security clauses a caller's permissions earn them.
   *
   * Three outcomes, and the middle one is the one that matters:
   *
   *  - holds a `:any` read permission → no clause; they may see everything,
   *    which is what `transactions:read:any` means.
   *  - holds only `:own` → a clause pinning every query to their party id.
   *  - holds neither → **refused**. Not "no clause", which would mean
   *    unrestricted: a missing RLS clause is not a safe default, it is the
   *    absence of the control.
   */
  private rlsFor(partyId: string, permissions: string[]): Array<{ clause: string }> {
    const has = (permission: string) => permissions.includes(permission);

    if (has('transactions:read:any') || has('reports:read') || has('ledger:read')) {
      return [];
    }

    if (has('transactions:read:own') || has('wallets:read:own')) {
      // Quoted and pinned to the resolved party id, never to anything the
      // request supplied. A party id from this platform is a `party_<uuid>`,
      // so there is no quote to escape — but the clause is built from the
      // gateway's value rather than a body field so that stays true.
      return [{ clause: `party_id = '${partyId.replace(/'/g, "''")}'` }];
    }

    throw new ForbiddenException(
      'you do not hold a permission that allows any dashboard data; a guest token with no row-level ' +
        'security clause would expose every customer, so none is issued',
    );
  }

  /**
   * Superset's admin login. The one credential in this platform that talks to
   * Superset, and it stays in this process.
   */
  private async adminAccessToken(): Promise<string> {
    if (this.adminToken && Date.now() < this.adminToken.expiresAt) {
      return this.adminToken.value;
    }

    const res = await fetch(new URL('/api/v1/security/login', this.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: this.username,
        password: this.password,
        provider: 'db',
        refresh: false,
      }),
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(`Superset login failed with ${res.status}`);
    }

    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) {
      throw new ServiceUnavailableException('Superset login returned no access_token');
    }

    // A minute of headroom on Superset's default hour.
    this.adminToken = { value: body.access_token, expiresAt: Date.now() + 59 * 60 * 1000 };
    return this.adminToken.value;
  }
}
