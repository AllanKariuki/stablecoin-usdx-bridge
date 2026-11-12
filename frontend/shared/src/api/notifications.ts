import { del, get, post, put } from './client';

/** services/notifications, via bff. Shapes mirror notifications.controller.ts. */
export interface AppNotification {
  id: string;
  event: string;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'critical' | string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export type NotificationChannel = 'IN_APP' | 'EMAIL';

export interface PreferenceOverride {
  event: string;
  channel: NotificationChannel | string;
  enabled: boolean;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  createdAt?: string;
  [field: string]: unknown;
}

/** Events a customer can tune; the service treats anything not overridden as enabled. */
export const NOTIFICATION_EVENTS: Array<{ event: string; label: string; description: string }> = [
  { event: 'payment.settled', label: 'Payment completed', description: 'A deposit, withdrawal or transfer finished.' },
  { event: 'payment.failed', label: 'Payment failed', description: 'A payment could not be completed. No money moved.' },
  { event: 'invoice.issued', label: 'New invoice', description: 'Someone sent you an invoice to pay.' },
  { event: 'damp.ledger.transaction_posted.v1', label: 'Account activity', description: 'Any posting to one of your wallets.' },
];

export const notificationsApi = {
  list: (unreadOnly = false) =>
    get<{ notifications: AppNotification[]; unreadCount: number }>('/notifications', unreadOnly ? { unread: 'true' } : undefined),
  markRead: (id: string) => post<{ id: string; read: true }>(`/notifications/${encodeURIComponent(id)}/read`),
  markAllRead: () => post<{ marked: number }>('/notifications/read-all'),
  preferences: async () => (await get<{ overrides: PreferenceOverride[] }>('/notification-preferences')).overrides,
  setPreference: (pref: PreferenceOverride) => put<PreferenceOverride>('/notification-preferences', pref),
  webhooks: async () => (await get<{ endpoints: WebhookEndpoint[] }>('/webhooks')).endpoints,
  /** The response carries the signing secret exactly once. */
  createWebhook: (input: { url: string; events?: string[] }) =>
    post<{ id: string; url: string; events: string[]; secret: string; note: string }>('/webhooks', input),
  deleteWebhook: (id: string) => del<{ id: string; deleted: true }>(`/webhooks/${encodeURIComponent(id)}`),
};
