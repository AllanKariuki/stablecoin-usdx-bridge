import React from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../redux/store';
import { 
  addNotamNotification, 
  addSystemNotification, 
  addGeneralNotification 
} from '../../redux/slices/navigation/unifiedNotificationsSlice';

/**
 * Test component to simulate notification events
 * Remove this in production
 */
const NotificationTestButton: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();

  const simulateNotamNotification = () => {
    dispatch(addNotamNotification({
      notam_id: 'HKJK/25-TEST',
      location: 'HKJK',
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 3600000).toISOString(),
      description: 'TEST: RWY 06/24 CLOSED FOR MAINTENANCE',
      lower_limit: 'SFC',
      upper_limit: 'UNL',
      type: 'RWY',
      status: 'ACTIVE',
      source: 'KCAA',
      priority: 'high',
      title: 'NOTAM HKJK/25-TEST',
      message: 'TEST: RWY 06/24 CLOSED FOR MAINTENANCE'
    }));
  };

  const simulateSystemNotification = () => {
    dispatch(addSystemNotification({
      title: 'System Maintenance Alert',
      message: 'Scheduled maintenance will begin in 30 minutes',
      priority: 'critical',
      systemType: 'maintenance',
      level: 'warning',
      actionRequired: true
    }));
  };

  const simulateGeneralNotification = () => {
    dispatch(addGeneralNotification({
      title: 'Flight Schedule Update',
      message: 'New flight schedules have been published for next week',
      priority: 'medium',
      type: 'announcement'
    }));
  };

  return (
    <div className="flex gap-2 p-4">
      <button
        onClick={simulateNotamNotification}
        className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
      >
        Test NOTAM
      </button>
      <button
        onClick={simulateSystemNotification}
        className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
      >
        Test System
      </button>
      <button
        onClick={simulateGeneralNotification}
        className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
      >
        Test General
      </button>
    </div>
  );
};

export default NotificationTestButton;
