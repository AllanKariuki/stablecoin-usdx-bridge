/**
 * Embedded dashboard configuration.
 *
 * Two things left this file, and both mattered:
 *
 *  - **The dashboards.** `CREW_REPORTS`, `FLIGHT_REPORTS`,
 *    `MAINTENANCE_REPORTS`, `SAFETY_COMPLIANCE` — aviation dashboards from
 *    the app this frontend was forked from, the same lineage P0 purged Cesium
 *    and the flight/crew charts from, and P4's notification system carried
 *    NOTAMs from.
 *  - **The URL building and auth config.** The browser no longer constructs
 *    Superset URLs or holds anything resembling a credential: it asks
 *    `services/reporting` for a guest token and is told where to load the
 *    dashboard from. The three-environment `ENVIRONMENTS` map and the
 *    `staticGuestToken` option it carried are gone with it — a static guest
 *    token in frontend config is a bearer credential in a JS bundle.
 */

/** The dashboards this platform actually has. */
export const DASHBOARDS = {
  TREASURY: 'damp-treasury',
  RESERVES: 'damp-reserves',
  PAYMENTS: 'damp-payments',
  COMPLIANCE: 'damp-compliance',
} as const;

export type DashboardType = keyof typeof DASHBOARDS;

/**
 * Which role each dashboard is for, so the UI can avoid offering one that
 * will be refused.
 *
 * It is a hint, not the control. The control is the row-level security clause
 * on the guest token, applied by Superset to every query the iframe runs and
 * derived server-side from the caller's resolved permissions — a customer who
 * reached a treasury dashboard would still see only their own rows, and one
 * with no read permission at all gets no token.
 */
export const DASHBOARD_PERMISSIONS: Record<DashboardType, string> = {
  TREASURY: 'reports:read',
  RESERVES: 'reserves:read',
  PAYMENTS: 'payments:read:own',
  COMPLIANCE: 'compliance:cases:manage',
};

export const DASHBOARD_TITLES: Record<DashboardType, string> = {
  TREASURY: 'Treasury',
  RESERVES: 'Reserves & reconciliation',
  PAYMENTS: 'Payments',
  COMPLIANCE: 'Compliance',
};
