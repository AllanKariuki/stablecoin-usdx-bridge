import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../redux/store';
import { useWebSocket } from './useWebSocket';
import { 
  fetchNotifications,
  addNotamNotification,
  addSystemNotification,
  addGeneralNotification
} from '../redux/slices/navigation/unifiedNotificationsSlice';

/**
 * Hook to initialize and manage notification system using existing websocket infrastructure
 */
export const useWebsocketNotifications = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { messages, isConnected } = useWebSocket();

  // Fetch initial notifications on mount
  useEffect(() => {
    dispatch(fetchNotifications());
  }, [dispatch]);

  // Process incoming websocket messages for notifications
  useEffect(() => {
    if (!isConnected || messages.length === 0) return;

    // Process the latest messages
    messages.forEach(message => {
      switch (message.type) {
        case 'notam':
        case 'notam_notification':
        case 'notam_alert': {
          const payload = message.payload as any;
          dispatch(addNotamNotification({
            notam_id: payload.notam_id,
            location: payload.location,
            start_time: payload.start_time,
            end_time: payload.end_time,
            schedule: payload.schedule,
            description: payload.description,
            lower_limit: payload.lower_limit,
            upper_limit: payload.upper_limit,
            type: payload.type,
            status: payload.status,
            created_at: payload.created_at,
            source: payload.source,
            priority: payload.priority || 'medium',
            title: `NOTAM ${payload.notam_id}`,
            message: payload.description
          }));
          break;
        }
        
        case 'system':
        case 'system_notification':
        case 'system_alert': {
          const payload = message.payload as any;
          dispatch(addSystemNotification({
            title: payload.title || 'System Notification',
            message: payload.message || payload.description,
            priority: payload.priority || 'medium',
            systemType: payload.systemType || 'alert',
            level: payload.level || 'info',
            actionRequired: payload.actionRequired,
            actionUrl: payload.actionUrl
          }));
          break;
        }
        
        case 'general':
        case 'general_notification':
        case 'announcement': {
          const payload = message.payload as any;
          dispatch(addGeneralNotification({
            title: payload.title || 'General Notification',
            message: payload.message || payload.description,
            priority: payload.priority || 'medium',
            type: payload.type || 'info',
            source: payload.source,
            expiresAt: payload.expiresAt,
            actionRequired: payload.actionRequired,
            actionUrl: payload.actionUrl
          }));
          break;
        }
      }
    });
  }, [messages, isConnected, dispatch]);

  return {
    isConnected
  };
};

export default useWebsocketNotifications;
