import React, { useEffect } from 'react';
import { X, AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';
import { removeNotification } from '../../redux/slices/oauth-web-sockets/notificationSlice';
import type { Notification } from '../../types/notification/notification';
import { useDispatch } from 'react-redux';

const NotificationItem: React.FC<{ notification: Notification }> = ({ notification }) => {
    const dispatch = useDispatch();
    const getIcon = () => {
        switch (notification.type) {
            case 'success':
                return <CheckCircle className='w-5 h-5 text-green-500' />;
            case 'error':
                return <XCircle className='w-5 h-5 text-red-500' />;
            case 'warning':
                return <AlertTriangle className='w-5 h-5 text-yellow-500' />;
            default:
                return <Info className='w-5 h-5 text-blue-500' />;
        }
    };

    const getBorderColor = () => {
        switch (notification.type) {
            case 'success':
                return 'border-green-200';
            case 'error':
                return 'border-red-300';
            case 'warning':
                return 'border-yellow-200';
            default:
                return 'border-blue-200';
        }
    };

    const handleClose = () => {
        dispatch(removeNotification(notification.id));
    }
    
    // Auto-remove notification after duration
    useEffect(() => {
        if (notification.duration && notification.duration > 0 && !notification.isCountdown) {
            const timer = setTimeout(() => {
                dispatch(removeNotification(notification.id));
            }, notification.duration);

            return () => clearTimeout(timer);
        }
    }, [notification.duration, notification.id, notification.isCountdown, dispatch]);

  return (
    <div className={`
        flex items-center p-4 rounded-sm border-t-3 shadow-md 
        transition-all duration-300 bg-white
        ${getBorderColor()} 
        ${notification.isCountdown ? 'animate-pulse' : ''}
    `}>
        <div className='flex-shrink-0 mr-3'>
            {getIcon()}
        </div>
        <div className='flex-1 min-w-0'>
            <h4 className='text-sm font-medium text-gray-900 mb-1'>
                {notification.title}
            </h4>
            <p className='text-sm text-gray-700'>
                {notification.message}
            </p>
            {/* {notification.isCountdown && notification.countdownValue && (
                <div className='mt-2'>
                    <div className='text-lg font-bold text-red-600'>
                        {notification.countdownValue}
                    </div>
                </div>
            )} */}
        </div>
        <button onClick={handleClose} className='flex-shrink-0 ml-3 p-1 rounded-md hoverLbg-gray-200 transition-colors'>
            <X className='w-4 h04 text-gray-500' />
        </button>
    </div>
  )
}

export default NotificationItem;
