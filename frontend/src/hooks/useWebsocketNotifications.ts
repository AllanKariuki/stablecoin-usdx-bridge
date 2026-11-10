import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../redux/store';
import { useWebSocket } from './useWebSocket';
import {
  fetchNotifications,
  notificationReceived,
} from '../redux/slices/navigation/unifiedNotificationsSlice';
import type { NotificationSeverity } from '../types/navigation/unifiedNotifications';

/**
 * Live notifications from services/notifications.
 *
 * This hook used to switch on `notam`, `notam_notification` and `notam_alert`
 * message types — aviation "Notice to Air Missions" events, left over from the
 * app this frontend was forked from. Nothing has ever sent one.
 *
 * services/notifications sends exactly one message type, `notification`, in
 * the envelope `frontend/src/types/auth-and-websocket/websocket.ts` already
 * declares. The server-side shape is in
 * services/notifications/src/delivery/delivery.service.ts's `dispatch`.
 */

interface IncomingNotification {
  event: string;
  subject: string;
  body: string;
  severity: NotificationSeverity;
  payload: Record<string, unknown>;
}

export const useWebsocketNotifications = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { messages, isConnected } = useWebSocket();

  // The socket only carries what happens *while* it is open, so the list is
  // fetched once on mount and again on every reconnect — otherwise anything
  // that arrived during a dropped connection is invisible until a reload.
  useEffect(() => {
    if (isConnected) void dispatch(fetchNotifications());
  }, [dispatch, isConnected]);

  useEffect(() => {
    if (messages.length === 0) return;

    const latest = messages[messages.length - 1];
    if (latest.type !== 'notification') return;

    const incoming = latest.payload as IncomingNotification;
    dispatch(
      notificationReceived({
        // The socket message's own id. The slice dedupes on it, because the
        // same notification arrives twice by design — once live here, once in
        // the next fetch.
        id: latest.id,
        event: incoming.event,
        title: incoming.subject,
        message: incoming.body,
        severity: incoming.severity,
        category: categoryOf(incoming.event),
        data: incoming.payload ?? {},
        isRead: false,
        timestamp: new Date(latest.timestamp).toISOString(),
      }),
    );
  }, [dispatch, messages]);
};

function categoryOf(event: string) {
  if (event.startsWith('payment.') || event.startsWith('invoice.')) return 'payment' as const;
  if (event.includes('.ledger.')) return 'ledger' as const;
  if (event.includes('.reserves.')) return 'reserves' as const;
  return 'system' as const;
}

export default useWebsocketNotifications;
