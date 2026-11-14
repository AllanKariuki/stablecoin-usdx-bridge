import { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { NOTIFICATION_EVENTS, notificationsApi, type NotificationChannel } from '@damp/web-shared/api/notifications';
import { useLiveNotifications } from '@damp/web-shared/notifications';
import { cx, timeAgo, useAsync } from '@damp/web-shared/lib';
import { Button, Callout, Card, CardHeader, EmptyState, ErrorState, LiveDot, PageHeader, SkeletonRows, Tabs } from '@damp/web-shared/ui';

export default function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const list = useAsync(() => notificationsApi.list(filter === 'unread'), [filter]);
  const socket = useLiveNotifications(() => list.reload());

  // Optimistic is fine here — marking read moves no money.
  const markRead = (id: string) => {
    list.setData((prev) => ({ notifications: (prev?.notifications ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)), unreadCount: Math.max(0, (prev?.unreadCount ?? 1) - 1) }));
    void notificationsApi.markRead(id).catch(list.reload);
  };
  const markAll = () => {
    list.setData((prev) => ({ notifications: (prev?.notifications ?? []).map((n) => ({ ...n, read: true })), unreadCount: 0 }));
    void notificationsApi.markAllRead().catch(list.reload);
  };

  return (
    <>
      <PageHeader
        eyebrow="Notifications"
        title="Notifications"
        description="Payments, invoices and account activity, as it happens."
        actions={<LiveDot live={socket === 'live'} label={socket === 'live' ? 'Live' : socket === 'connecting' ? 'Connecting' : 'Reconnecting…'} />}
      />
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader
            title="Inbox"
            actions={
              list.data?.unreadCount ? (
                <Button size="sm" variant="ghost" icon={<CheckCheck className="size-4" aria-hidden />} onClick={markAll}>
                  Mark all read
                </Button>
              ) : undefined
            }
          />
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: 'all', label: 'All' },
              { value: 'unread', label: 'Unread', count: list.data?.unreadCount },
            ]}
          />
          {list.loading && !list.data ? (
            <SkeletonRows rows={5} />
          ) : list.error ? (
            <ErrorState message={apiErrorMessage(list.error)} onRetry={list.reload} />
          ) : !list.data?.notifications.length ? (
            <EmptyState icon={<Bell className="size-6" aria-hidden />} title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}>
              We’ll tell you here when payments complete, invoices arrive or your verification changes.
            </EmptyState>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {list.data.notifications.map((n) => (
                <li key={n.id} className={cx('flex gap-3 border-b border-line py-3.5 last:border-0', !n.read && 'bg-action-tint/30 -mx-3 rounded-[12px] px-3')}>
                  <span className={cx('mt-1.5 size-2.5 shrink-0 rounded-full', n.read ? 'bg-line-strong' : n.severity === 'warning' || n.severity === 'critical' ? 'bg-warn' : 'bg-action')} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{n.title}</p>
                    <p className="text-[13px] leading-snug text-muted">{n.message}</p>
                    <p className="mt-1 text-xs text-subtle">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>
                      Mark read
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Preferences />
      </div>
    </>
  );
}

const CHANNELS: Array<{ channel: NotificationChannel; label: string }> = [
  { channel: 'IN_APP', label: 'In app' },
  { channel: 'EMAIL', label: 'Email' },
];

function Preferences() {
  const prefs = useAsync(() => notificationsApi.preferences(), []);
  const [error, setError] = useState<string | null>(null);
  // The service stores overrides only; anything absent is enabled.
  const enabled = (event: string, channel: string) => prefs.data?.find((p) => p.event === event && p.channel === channel)?.enabled ?? true;

  const toggle = async (event: string, channel: NotificationChannel, value: boolean) => {
    setError(null);
    prefs.setData((prev) => [...(prev ?? []).filter((p) => !(p.event === event && p.channel === channel)), { event, channel, enabled: value }]);
    try {
      await notificationsApi.setPreference({ event, channel, enabled: value });
    } catch (err) {
      setError(apiErrorMessage(err));
      prefs.reload();
    }
  };

  return (
    <Card>
      <CardHeader title="Preferences" description="Choose how you hear about each event." />
      {prefs.loading ? (
        <SkeletonRows rows={4} />
      ) : prefs.error ? (
        <ErrorState message={apiErrorMessage(prefs.error)} onRetry={prefs.reload} />
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {NOTIFICATION_EVENTS.map((e) => (
            <fieldset key={e.event} className="m-0 border-0 px-0 py-3">
              <legend className="text-sm font-semibold text-ink">{e.label}</legend>
              <p className="mb-2 text-xs text-muted">{e.description}</p>
              <div className="flex gap-4">
                {CHANNELS.map((c) => (
                  <label key={c.channel} className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-neutral-ink">
                    <input type="checkbox" className="size-4 accent-[#1463d6]" checked={enabled(e.event, c.channel)} onChange={(ev) => void toggle(e.event, c.channel, ev.target.checked)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}
      {error && <Callout tone="danger" className="mt-3">{error}</Callout>}
    </Card>
  );
}
