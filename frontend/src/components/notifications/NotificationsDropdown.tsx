import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRightLeft, BadgeCheck, Bell, CheckCheck, Info, Landmark, X } from 'lucide-react';
import type { AppDispatch } from '../../redux/store';
import {
  markAllNotificationsRead,
  markNotificationRead,
  selectAllNotifications,
  selectNotificationStats,
  selectNotificationsError,
  selectNotificationsLoading,
} from '../../redux/slices/navigation/unifiedNotificationsSlice';
import type { NotificationCategory, PlatformNotification } from '../../types/navigation/unifiedNotifications';

interface NotificationsDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

const TABS: Array<{ key: NotificationCategory | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'payment', label: 'Payments' },
  { key: 'ledger', label: 'Account' },
  { key: 'reserves', label: 'Reserves' },
];

/**
 * The notification list behind the bell.
 *
 * Rewritten for services/notifications' shape. What went with the old one:
 * a "NOTAM" tab rendering altitude bands and a start/end schedule, and a
 * click handler that navigated to `/dispatch/notam-alerts/:id` — a route that
 * does not exist in this app and describes an aviation notice. Both were
 * inherited from the app this frontend was forked from.
 *
 * What replaced them is the four event families this platform actually emits.
 * `reserves` is worth its own tab even though a customer never sees one: a
 * reconciliation break is broadcast to every connected operator, and burying
 * it under "All" is how a critical alert gets scrolled past.
 */
const NotificationsDropdown: React.FC<NotificationsDropdownProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<NotificationCategory | 'all'>('all');

  const notifications = useSelector(selectAllNotifications);
  const stats = useSelector(selectNotificationStats);
  const loading = useSelector(selectNotificationsLoading);
  const error = useSelector(selectNotificationsError);

  const visible = useMemo(
    () => (activeTab === 'all' ? notifications : notifications.filter((n) => n.category === activeTab)),
    [notifications, activeTab],
  );

  if (!isOpen) return null;

  const handleOpen = (notification: PlatformNotification) => {
    if (!notification.isRead) void dispatch(markNotificationRead(notification.id));

    // Deep links come from the event's own payload rather than a per-category
    // switch: the producer already knows which object it is telling you about,
    // and a switch here would be a second, stale copy of that knowledge.
    const { intentId, invoiceId, ledgerTxId } = notification.data as Record<string, string | undefined>;
    if (intentId) navigate(`/payments/history?intent=${intentId}`);
    else if (invoiceId) navigate(`/payments/invoices/${invoiceId}`);
    else if (ledgerTxId) navigate(`/wallet/transactions/${ledgerTxId}`);
    onClose();
  };

  return (
    <div className="absolute right-0 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-xl border border-gray-200 z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Notifications</h3>
          {stats.unread > 0 && (
            <span className="bg-blue-100 text-blue-700 text-xs font-semibold rounded-full px-2 py-0.5">
              {stats.unread} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {stats.unread > 0 && (
            <button
              onClick={() => void dispatch(markAllNotificationsRead())}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors"
              title="Mark all as read"
            >
              <CheckCheck className="w-4 h-4 text-gray-500" />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      <div className="flex gap-1 px-2 py-2 border-b border-gray-200 overflow-x-auto">
        {TABS.map((tab) => {
          const count = tab.key === 'all' ? stats.total : stats.byCategory[tab.key];
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                activeTab === tab.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
              {count > 0 && <span className="ml-1.5 opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {loading && <p className="px-4 py-8 text-center text-sm text-gray-500">Loading…</p>}

        {error && !loading && (
          <div className="px-4 py-6 text-center">
            <AlertTriangle className="w-5 h-5 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-gray-500">Nothing here yet.</p>
        )}

        {visible.map((notification) => (
          <button
            key={notification.id}
            onClick={() => handleOpen(notification)}
            className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors flex gap-3 ${
              notification.isRead ? '' : 'bg-blue-50/60'
            }`}
          >
            <SeverityIcon notification={notification} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-sm ${notification.isRead ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
                  {notification.title}
                </p>
                {!notification.isRead && <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-600 shrink-0" />}
              </div>
              <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{notification.message}</p>
              <p className="text-[11px] text-gray-400 mt-1">{relativeTime(notification.timestamp)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

const SeverityIcon: React.FC<{ notification: PlatformNotification }> = ({ notification }) => {
  const base = 'w-4 h-4 shrink-0 mt-0.5';
  if (notification.severity === 'critical') return <AlertTriangle className={`${base} text-red-600`} />;
  if (notification.severity === 'warning') return <AlertTriangle className={`${base} text-amber-600`} />;
  if (notification.severity === 'success') return <BadgeCheck className={`${base} text-green-600`} />;
  if (notification.category === 'payment') return <ArrowRightLeft className={`${base} text-blue-600`} />;
  if (notification.category === 'reserves') return <Landmark className={`${base} text-purple-600`} />;
  return <Info className={`${base} text-gray-500`} />;
};

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default NotificationsDropdown;
