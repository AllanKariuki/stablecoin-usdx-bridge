import { post } from '../api';

/**
 * Embedded Superset dashboards, through the platform's own gateway.
 *
 * **What changed, and why it had to.** This service used to call Superset's
 * `POST /api/v1/security/guest_token/` directly from the browser. That
 * endpoint requires a Superset **admin** bearer token — so either an admin
 * credential was being shipped to the browser, or the call had never worked.
 * The second is how it survived: nothing in the app rendered a dashboard, so
 * nothing surfaced the failure.
 *
 * Guest tokens are now minted by `services/reporting`, where the admin
 * credential lives, and handed to a browser the gateway has already
 * authenticated. The browser never talks to Superset's API at all — only to
 * the embed SDK, with a token it was given.
 *
 * The token also carries row-level security clauses derived from the caller's
 * *resolved* permissions, so a customer's dashboard is scoped to their own
 * rows by the analytics database rather than by the dashboard being careful.
 */

export interface GuestTokenResult {
  token: string;
  /** Where the embed SDK should load the dashboard from. */
  supersetUrl: string;
  /**
   * Seconds. Returned so a long-lived page can refresh before expiry rather
   * than discovering it mid-session with a blank iframe.
   */
  expiresInSeconds: number;
}

class SupersetService {
  /**
   * Requests a guest token for one dashboard.
   *
   * No username, no permissions, no RLS clauses are passed: all three are
   * decided server-side from the identity auth-proxy resolved. A client that
   * could name its own permissions would be a client that could name its own
   * access.
   */
  async guestToken(dashboardId: string): Promise<GuestTokenResult> {
    return post<GuestTokenResult, Record<string, never>>(
      `/reports/dashboards/${encodeURIComponent(dashboardId)}/guest-token`,
      {},
    );
  }

  /**
   * The callback the Superset embed SDK wants.
   *
   * It is called on mount and again whenever the token expires, which is why
   * it fetches fresh every time rather than caching: a cached token in a tab
   * left open overnight is a blank dashboard in the morning.
   */
  fetchGuestToken = async (dashboardId: string): Promise<string> => {
    const { token } = await this.guestToken(dashboardId);
    return token;
  };
}

export const supersetService = new SupersetService();
export default supersetService;
