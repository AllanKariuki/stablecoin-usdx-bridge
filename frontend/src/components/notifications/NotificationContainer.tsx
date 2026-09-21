import React from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../../redux/store'
import NotificationItem from './NotificationItem';

const NotificationContainer:React.FC = () => {
    const notifications = useSelector((state: RootState) => state.notification.notifications);

    if (notifications.length === 0) return null;

  return (
    <div className='fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full'>
        {notifications.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} />
        ))}
    </div>
  );
};

export default NotificationContainer
