import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type Notification } from '../../../types/notification/notification';

interface NotificationState {
    notifications: Notification[];
}

const initialState: NotificationState = {
    notifications: []
};

const notificationSlice = createSlice({
    name: 'notification',
    initialState,
    reducers: {
        addNotification: (state, action: PayloadAction<Notification>) => {
            state.notifications.push(action.payload);
        },
        removeNotification: (state, action: PayloadAction<string>) => {
            state.notifications = state.notifications.filter(notification => notification.id !== action.payload);
        },
        updateNotification: (state, action: PayloadAction<{ id: string, updates: Partial<Notification> }>) => {
            const { id, updates } = action.payload;
            const notification = state.notifications.find(n => n.id === id);
            if (notification) {
                Object.assign(notification, updates);
            }
        },
        clearAllNotifications: (state) => {
            state.notifications = [];
        }
    }
});

export const {
    addNotification, removeNotification, updateNotification, clearAllNotifications
} = notificationSlice.actions;
export default notificationSlice.reducer;