import { createSlice, createAsyncThunk, type PayloadAction, createSelector } from '@reduxjs/toolkit';
import type { 
  UnifiedNotification, 
  UnifiedNotificationsState, 
  NotificationStats,
  SystemNotification,
  NotamNotification,
  GeneralNotification
} from '../../../types/navigation/unifiedNotifications';
import { get } from '../../../api';

const initialStats: NotificationStats = {
  total: 0,
  unread: 0,
  byCategory: { system: 0, notam: 0, general: 0 },
  byPriority: { low: 0, medium: 0, high: 0, critical: 0 }
};

const initialState: UnifiedNotificationsState = {
  notifications: [],
  loading: false,
  error: null,
  stats: initialStats,
  lastUpdated: null
};

// Calculate statistics from notifications
const calculateStats = (notifications: UnifiedNotification[]): NotificationStats => {
  const stats: NotificationStats = {
    total: notifications.length,
    unread: notifications.filter(n => !n.isRead).length,
    byCategory: { system: 0, notam: 0, general: 0 },
    byPriority: { low: 0, medium: 0, high: 0, critical: 0 }
  };

  notifications.forEach(notification => {
    stats.byCategory[notification.category]++;
    stats.byPriority[notification.priority]++;
  });

  return stats;
};

// Async thunks
export const fetchNotifications = createAsyncThunk(
  'unifiedNotifications/fetchAll',
  async () => {
    try {
      const response = await get('/notifications/unified');
      return response as UnifiedNotification[];
  } catch {
      // Mock data for fallback
      const mockNotifications: UnifiedNotification[] = [
        {
          id: '1',
          title: 'System Maintenance',
          message: 'Scheduled maintenance will begin at 02:00 UTC',
          timestamp: new Date().toISOString(),
          isRead: false,
          category: 'system',
          priority: 'high',
          systemType: 'maintenance',
          level: 'warning',
          actionRequired: true
        } as SystemNotification,
        {
          id: '2',
          title: 'New General Announcement',
          message: 'Updated flight procedures are now in effect',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          isRead: false,
          category: 'general',
          priority: 'medium',
          type: 'announcement'
        } as GeneralNotification
      ];
      return mockNotifications;
    }
  }
);

export const markNotificationAsRead = createAsyncThunk(
  'unifiedNotifications/markAsRead',
  async (notificationId: string) => {
    try {
      await get(`/notifications/${notificationId}/read`);
      return notificationId;
  } catch {
      // Still mark as read locally even if API fails
      return notificationId;
    }
  }
);

export const markAllAsRead = createAsyncThunk(
  'unifiedNotifications/markAllAsRead',
  async () => {
    try {
      await get('/notifications/mark-all-read');
      return true;
  } catch {
      // Still mark all as read locally even if API fails
      return true;
    }
  }
);

const unifiedNotificationsSlice = createSlice({
  name: 'unifiedNotifications',
  initialState,
  reducers: {
    addNotification: (state, action: PayloadAction<UnifiedNotification>) => {
      state.notifications.unshift(action.payload);
      state.stats = calculateStats(state.notifications);
      state.lastUpdated = new Date().toISOString();
    },
    
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
      state.stats = calculateStats(state.notifications);
      state.lastUpdated = new Date().toISOString();
    },
    
    updateNotification: (state, action: PayloadAction<{ id: string; updates: Partial<UnifiedNotification> }>) => {
      const { id, updates } = action.payload;
      const index = state.notifications.findIndex(n => n.id === id);
      if (index !== -1) {
        Object.assign(state.notifications[index], updates);
        state.stats = calculateStats(state.notifications);
        state.lastUpdated = new Date().toISOString();
      }
    },
    

    
    addNotamNotification: (state, action: PayloadAction<Omit<NotamNotification, 'id' | 'timestamp' | 'isRead' | 'category'>>) => {
      const notification: NotamNotification = {
        ...action.payload,
        id: `notam_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        isRead: false,
        category: 'notam',
        title: `NOTAM ${action.payload.notam_id}`,
        message: action.payload.description
      };
      state.notifications.unshift(notification);
      state.stats = calculateStats(state.notifications);
      state.lastUpdated = new Date().toISOString();
    },
    
    addSystemNotification: (state, action: PayloadAction<Omit<SystemNotification, 'id' | 'timestamp' | 'isRead' | 'category'>>) => {
      const notification: SystemNotification = {
        ...action.payload,
        id: `system_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        isRead: false,
        category: 'system'
      };
      state.notifications.unshift(notification);
      state.stats = calculateStats(state.notifications);
      state.lastUpdated = new Date().toISOString();
    },
    
    addGeneralNotification: (state, action: PayloadAction<Omit<GeneralNotification, 'id' | 'timestamp' | 'isRead' | 'category'>>) => {
      const notification: GeneralNotification = {
        ...action.payload,
        id: `general_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        isRead: false,
        category: 'general'
      };
      state.notifications.unshift(notification);
      state.stats = calculateStats(state.notifications);
      state.lastUpdated = new Date().toISOString();
    },
    
    clearError: (state) => {
      state.error = null;
    }
  },
  
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.notifications = action.payload;
        state.stats = calculateStats(action.payload);
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch notifications';
      })
      
      .addCase(markNotificationAsRead.fulfilled, (state, action) => {
        const notification = state.notifications.find(n => n.id === action.payload);
        if (notification && !notification.isRead) {
          notification.isRead = true;
          notification.readAt = new Date().toISOString();
          state.stats = calculateStats(state.notifications);
          state.lastUpdated = new Date().toISOString();
        }
      })
      
      .addCase(markAllAsRead.fulfilled, (state) => {
        state.notifications.forEach(notification => {
          if (!notification.isRead) {
            notification.isRead = true;
            notification.readAt = new Date().toISOString();
          }
        });
        state.stats = calculateStats(state.notifications);
        state.lastUpdated = new Date().toISOString();
      });
  }
});

// Selectors
// export const selectAllNotifications = (state: { unifiedNotifications: UnifiedNotificationsState }) => 
//   state.unifiedNotifications.notifications;

// export const selectNotificationsByCategory = (category: 'system' | 'notam' | 'general') => 
//   (state: { unifiedNotifications: UnifiedNotificationsState }) =>
//     state.unifiedNotifications.notifications.filter(n => n.category === category);

// export const selectUnreadNotifications = (state: { unifiedNotifications: UnifiedNotificationsState }) =>
//   state.unifiedNotifications.notifications.filter(n => !n.isRead);
export const selectAllNotifications = (state: { unifiedNotifications: UnifiedNotificationsState }) => 
  state.unifiedNotifications.notifications;

// Memoized selector for notifications by category
export const selectNotificationsByCategory = createSelector(
  [
    selectAllNotifications,
    (_state: { unifiedNotifications: UnifiedNotificationsState }, category: 'system' | 'notam' | 'general') => category
  ],
  (notifications, category) => notifications.filter(n => n.category === category)
);

// Alternative approach: Create individual memoized selectors for each category
export const selectGeneralNotifications = createSelector(
  [selectAllNotifications],
  (notifications) => notifications.filter(n => n.category === 'general')
);

export const selectSystemNotifications = createSelector(
  [selectAllNotifications],
  (notifications) => notifications.filter(n => n.category === 'system')
);

export const selectNotamNotifications = createSelector(
  [selectAllNotifications],
  (notifications) => notifications.filter(n => n.category === 'notam')
);

export const selectUnreadNotifications = createSelector(
  [selectAllNotifications],
  (notifications) => notifications.filter(n => !n.isRead)
);

export const selectNotificationStats = (state: { unifiedNotifications: UnifiedNotificationsState }) =>
  state.unifiedNotifications.stats;

export const selectNotificationsLoading = (state: { unifiedNotifications: UnifiedNotificationsState }) =>
  state.unifiedNotifications.loading;

export const selectNotificationsError = (state: { unifiedNotifications: UnifiedNotificationsState }) =>
  state.unifiedNotifications.error;



export const {
  addNotification,
  removeNotification,
  updateNotification,
  addNotamNotification,
  addSystemNotification,
  addGeneralNotification,
  clearError
} = unifiedNotificationsSlice.actions;

export default unifiedNotificationsSlice.reducer;
