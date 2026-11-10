/**
 * What services/notifications actually returns.
 *
 * This file used to declare a three-way union whose middle member was
 * `NotamNotification` — a NOTAM is an aviation "Notice to Air Missions", with
 * `lower_limit`/`upper_limit` altitude bands and a `/dispatch/notam-alerts/`
 * route. It was left over from the aviation app this frontend was forked
 * from, the same lineage P0 purged Cesium, three.js and the flight/crew chart
 * components from. Nothing on a stablecoin platform will ever produce one.
 *
 * What replaced it is flat, because the backend's shape is flat: one delivery
 * row per notification, with the event that produced it and a severity the
 * template chose.
 */

/** The event families this platform actually emits. */
export type NotificationCategory = 'payment' | 'ledger' | 'reserves' | 'system';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';

export interface PlatformNotification {
  id: string;
  /** The producer's event name, e.g. `payment.settled`. */
  event: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  /** Derived from `event`'s prefix — see categoryOf in the slice. */
  category: NotificationCategory;
  /** The event payload, for a deep link or an amount the UI wants to show. */
  data: Record<string, unknown>;
  isRead: boolean;
  timestamp: string;
}

/** Kept as an alias so existing imports keep working. */
export type UnifiedNotification = PlatformNotification;

export interface NotificationStats {
  total: number;
  unread: number;
  byCategory: Record<NotificationCategory, number>;
  bySeverity: Record<NotificationSeverity, number>;
}

export interface UnifiedNotificationsState {
  notifications: PlatformNotification[];
  loading: boolean;
  error: string | null;
  stats: NotificationStats;
  lastUpdated: string | null;
}
