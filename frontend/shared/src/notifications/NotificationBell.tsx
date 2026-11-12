import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { notificationsApi, type AppNotification } from '../api/notifications';
import { cx } from '../lib/cx';
import { timeAgo } from '../lib/format';
import { LiveDot } from '../ui/Badge';
import { EmptyState, SkeletonRows } from '../ui/Feedback';
import { useLiveNotifications, type LiveNotification } from './useLiveNotifications';

/**
 * Top-bar bell: unread count, a short popover of recent items, a toast for
 * each live arrival, and the socket's connected/reconnecting state. The list
 * itself always comes from the HTTP API — the socket only says "something
 * new arrived", so a dropped frame can't lose a notification.
 */
export function NotificationBell({ allTo = '/notifications' }: { allTo?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<LiveNotification | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    notificationsApi.list().then(
      (r) => {
        setItems(r.notifications.slice(0, 8));
        setUnread(r.unreadCount);
      },
      () => setItems((prev) => prev ?? []),
    );
  }, []);

  useEffect(refresh, [refresh]);

  const socket = useLiveNotifications((n) => {
    setToast(n);
    refresh();
  });

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6_000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const markAll = async () => {
    await notificationsApi.markAllRead().catch(() => undefined);
    refresh();
  };

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex size-10 cursor-pointer items-center justify-center rounded-control text-muted transition-colors hover:bg-neutral-tint hover:text-ink"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-action px-1 text-[10px] font-bold leading-[18px] text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-40 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-[20px] border border-line bg-surface shadow-pop animate-pop">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-navy">Notifications</span>
              <LiveDot live={socket === 'live'} label={socket === 'live' ? 'Live' : 'Reconnecting'} />
            </div>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-action hover:bg-action-tint">
                <CheckCheck className="size-3.5" aria-hidden />
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {items === null ? (
              <SkeletonRows rows={3} className="p-4" />
            ) : items.length === 0 ? (
              <EmptyState icon={<Bell className="size-6" aria-hidden />} title="You're all caught up">
                Payments, invoices and account activity show up here.
              </EmptyState>
            ) : (
              <ul className="m-0 list-none p-0">
                {items.map((n) => (
                  <li key={n.id} className={cx('flex gap-3 border-b border-line px-4 py-3 last:border-0', !n.read && 'bg-action-tint/40')}>
                    <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : n.severity === 'warning' || n.severity === 'critical' ? 'bg-warn' : 'bg-action')} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{n.title}</p>
                      <p className="text-[13px] leading-snug text-muted">{n.message}</p>
                      <p className="mt-1 text-[11px] text-subtle">{timeAgo(n.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link to={allTo} onClick={() => setOpen(false)} className="block border-t border-line px-4 py-3 text-center text-[13px] font-semibold text-action no-underline hover:bg-canvas">
            See all notifications
          </Link>
        </div>
      )}

      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50">
        {toast && (
          <div className="pointer-events-auto flex w-[min(360px,calc(100vw-32px))] gap-3 rounded-[18px] bg-navy p-4 text-white shadow-pop animate-pop">
            <Bell className="mt-0.5 size-5 shrink-0 text-cyan" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-bold">{toast.subject}</p>
              <p className="text-[13px] leading-snug text-on-navy-muted">{toast.body}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
