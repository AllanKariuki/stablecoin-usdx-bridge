import { createSlice, createAsyncThunk, createSelector, type PayloadAction } from '@reduxjs/toolkit';
import type {
  NotificationCategory,
  NotificationSeverity,
  NotificationStats,
  PlatformNotification,
  UnifiedNotificationsState,
} from '../../../types/navigation/unifiedNotifications';
import { get, post } from '../../../api';

/**
 * Notifications, against services/notifications.
 *
 * `fetchNotifications` used to `GET /notifications/unified` — a route nothing
 * has ever served — catch the resulting 404, and return a hardcoded array of
 * three invented notices, one of which was a NOTAM. The bell showed an unread
 * count that was always the same three items on every account.
 *
 * There is no fallback now. An empty list means no notifications; an error
 * means the request failed, and the UI says which.
 */

const emptyStats: NotificationStats = {
  total: 0,
  unread: 0,
  byCategory: { payment: 0, ledger: 0, reserves: 0, system: 0 },
  bySeverity: { info: 0, success: 0, warning: 0, critical: 0 },
};

const initialState: UnifiedNotificationsState = {
  notifications: [],
  loading: false,
  error: null,
  stats: emptyStats,
  lastUpdated: null,
};

/**
 * The event name carries its own category: `payment.settled`,
 * `damp.ledger.transaction_posted.v1`, `damp.reserves.reconciliation_break_
 * opened.v1`. Deriving it here rather than having the backend send a second
 * field keeps the event name the single source of truth for what an event is.
 */
function categoryOf(event: string): NotificationCategory {
  if (event.startsWith('payment.') || event.startsWith('invoice.')) return 'payment';
  if (event.includes('.ledger.')) return 'ledger';
  if (event.includes('.reserves.')) return 'reserves';
  return 'system';
}

interface NotificationResponse {
  id: string;
  event: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

function toNotification(row: NotificationResponse): PlatformNotification {
  return {
    id: row.id,
    event: row.event,
    title: row.title,
    message: row.message,
    severity: row.severity,
    category: categoryOf(row.event),
    data: row.data ?? {},
    isRead: row.read,
    timestamp: row.createdAt,
  };
}

function statsOf(notifications: PlatformNotification[]): NotificationStats {
  const stats: NotificationStats = {
    total: notifications.length,
    unread: notifications.filter((n) => !n.isRead).length,
    byCategory: { payment: 0, ledger: 0, reserves: 0, system: 0 },
    bySeverity: { info: 0, success: 0, warning: 0, critical: 0 },
  };
  for (const n of notifications) {
    stats.byCategory[n.category] += 1;
    stats.bySeverity[n.severity] += 1;
  }
  return stats;
}

function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return message || (error instanceof Error ? error.message : fallback);
}

export const fetchNotifications = createAsyncThunk<PlatformNotification[], void, { rejectValue: string }>(
  'unifiedNotifications/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get<{ notifications: NotificationResponse[] }>('/notifications');
      return response.notifications.map(toNotification);
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Failed to load notifications'));
    }
  },
);

export const markNotificationRead = createAsyncThunk<string, string, { rejectValue: string }>(
  'unifiedNotifications/markRead',
  async (id, { rejectWithValue }) => {
    try {
      await post<{ id: string }, Record<string, never>>(`/notifications/${id}/read`, {});
      return id;
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Failed to mark as read'));
    }
  },
);

export const markAllNotificationsRead = createAsyncThunk<void, void, { rejectValue: string }>(
  'unifiedNotifications/markAllRead',
  async (_, { rejectWithValue }) => {
    try {
      await post<{ marked: number }, Record<string, never>>('/notifications/read-all', {});
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Failed to mark all as read'));
    }
  },
);

const unifiedNotificationsSlice = createSlice({
  name: 'unifiedNotifications',
  initialState,
  reducers: {
    /**
     * A notification pushed over the WebSocket.
     *
     * Prepended and deduped by id, because the same notification can arrive
     * twice: once live over the socket and once in the next `fetchNotifications`
     * — and a duplicate in the list would double the unread count.
     */
    notificationReceived(state, action: PayloadAction<PlatformNotification>) {
      state.notifications = [
        action.payload,
        ...state.notifications.filter((n) => n.id !== action.payload.id),
      ].slice(0, 100);
      state.stats = statsOf(state.notifications);
      state.lastUpdated = new Date().toISOString();
    },
    clearAllNotifications(state) {
      state.notifications = [];
      state.stats = emptyStats;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.notifications = action.payload;
        state.stats = statsOf(action.payload);
        state.loading = false;
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to load notifications';
      })
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        const found = state.notifications.find((n) => n.id === action.payload);
        if (found) found.isRead = true;
        state.stats = statsOf(state.notifications);
      })
      .addCase(markAllNotificationsRead.fulfilled, (state) => {
        state.notifications.forEach((n) => {
          n.isRead = true;
        });
        state.stats = statsOf(state.notifications);
      });
  },
});

export const { notificationReceived, clearAllNotifications } = unifiedNotificationsSlice.actions;
export default unifiedNotificationsSlice.reducer;

// --- Selectors -------------------------------------------------------------

const selectSlice = (state: { unifiedNotifications: UnifiedNotificationsState }) => state.unifiedNotifications;

export const selectAllNotifications = createSelector(selectSlice, (s) => s.notifications);
export const selectNotificationStats = createSelector(selectSlice, (s) => s.stats);
export const selectNotificationsLoading = createSelector(selectSlice, (s) => s.loading);
export const selectNotificationsError = createSelector(selectSlice, (s) => s.error);

export const selectNotificationsByCategory = (category: NotificationCategory) =>
  createSelector(selectAllNotifications, (all) => all.filter((n) => n.category === category));

export const selectUnreadNotifications = createSelector(selectAllNotifications, (all) =>
  all.filter((n) => !n.isRead),
);
