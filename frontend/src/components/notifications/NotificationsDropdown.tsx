import React, { useState, useEffect } from 'react';
import { X, Bell, AlertTriangle, Info, Plane, CheckCircle, XCircle, Settings } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch } from '../../redux/store';
import { 
  // selectNotificationsByCategory, 
  // selectNotificationStats,
  // selectNotificationsLoading,
  // markNotificationAsRead,
  // markAllAsRead,
  // fetchNotifications
  selectGeneralNotifications,
  selectSystemNotifications,
  selectNotamNotifications,
  selectNotificationStats,
  selectNotificationsLoading,
  markNotificationAsRead,
  markAllAsRead,
  fetchNotifications
} from '../../redux/slices/navigation/unifiedNotificationsSlice';
import type { UnifiedNotification, SystemNotification, NotamNotification } from '../../types/navigation/unifiedNotifications';
import { useNavigate } from 'react-router-dom';
interface NotificationsDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

const NotificationsDropdown: React.FC<NotificationsDropdownProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch<AppDispatch>();
  const [activeTab, setActiveTab] = useState<'general' | 'system' | 'notam'>('general');


  const stats = useSelector(selectNotificationStats);
  const loading = useSelector(selectNotificationsLoading);
  
  const generalNotifications = useSelector(selectGeneralNotifications);
  const systemNotifications = useSelector(selectSystemNotifications);
  const notamNotifications = useSelector(selectNotamNotifications);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchNotifications());
    }
  }, [isOpen, dispatch]);

  const handleMarkAsRead = (notificationId: string) => {
    dispatch(markNotificationAsRead(notificationId));
  };

  const handleMarkAllAsRead = () => {
    dispatch(markAllAsRead());
  };

  const handleNotificationClick = (notification: UnifiedNotification) => {
    handleMarkAsRead(notification.id);
    switch (notification.category) {
      case 'notam':
        navigate(`/dispatch/notam-alerts/${notification.id}`);
        break;
      case 'system':
        navigate(`/notifications/system-alerts/${notification.id}`);
        break;
      case 'general':
        navigate(`/notifications/flight-notifications/${notification.id}`);
        break;  
      default:
        break;
    }
  };

    // Group notifications by time periods
  const groupNotificationsByTime = (notifications: UnifiedNotification[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const groups: { [key: string]: UnifiedNotification[] } = {
      today: [],
      yesterday: [],
      lastWeek: [],
      lastMonth: [],
      older: []
    };

    notifications.forEach(notification => {
      const notificationDate = new Date(notification.timestamp);
      
      if (notificationDate >= today) {
        groups.today.push(notification);
      } else if (notificationDate >= yesterday) {
        groups.yesterday.push(notification);
      } else if (notificationDate >= lastWeek) {
        groups.lastWeek.push(notification);
      } else if (notificationDate >= lastMonth) {
        groups.lastMonth.push(notification);
      } else {
        groups.older.push(notification);
      }
    });

    return groups;
  };

  const getGroupedNotifications = () => {
    const activeNotifications = getActiveNotifications();
    return groupNotificationsByTime(activeNotifications);
  };

  const getGroupDisplayName = (groupKey: string) => {
    switch (groupKey) {
      case 'today':
        return 'Today';
      case 'yesterday':
        return 'Yesterday';
      case 'lastWeek':
        return 'Last Week';
      case 'lastMonth':
        return 'Last Month';
      case 'older':
        return 'Older';
      default:
        return groupKey;
    }
  };

  const getNotificationIcon = (notification: UnifiedNotification) => {
    switch (notification.category) {
      case 'system': {
        const sysNotif = notification as SystemNotification;
        switch (sysNotif.level) {
          case 'error':
            return <XCircle className="text-red-500" size={24} />;
          case 'warning':
            return <AlertTriangle className="text-amber-500" size={24} />;
          case 'success':
            return <CheckCircle className="text-green-500" size={24} />;
          default:
            return <Settings className="text-blue-500" size={24} />;
        }
      }
      case 'notam':
        return <Plane className="text-purple-500" size={24} />;
      case 'general':
        return <Info className="text-gray-500" size={24} />;
      default:
        return <Bell className="text-gray-500" size={24} />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
      return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const renderNotificationContent = (notification: UnifiedNotification) => {
    if (notification.category === 'notam') {
      const notamNotif = notification as NotamNotification;
      return (
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {notamNotif.notam_id} - {notamNotif.location}
          </p>
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
            {notamNotif.description}
          </p>
          <div className="flex items-center mt-1 text-xs text-gray-500">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              notamNotif.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
              notamNotif.status === 'FUTURE' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {notamNotif.status}
            </span>
            <span className="ml-2">{notamNotif.type}</span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {notification.title}
        </p>
        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
          {notification.message}
        </p>
      </div>
    );
  };

  const getActiveNotifications = () => {
    switch (activeTab) {
      case 'system':
        return systemNotifications;
      case 'notam':
        return notamNotifications;
      default:
        return generalNotifications;
    }
  };

  const tabs = [
    { 
      key: 'general' as const, 
      name: 'General', 
      count: stats.byCategory.general 
    },
    { 
      key: 'system' as const, 
      name: 'System', 
      count: stats.byCategory.system 
    },
    { 
      key: 'notam' as const, 
      name: 'NOTAM', 
      count: stats.byCategory.notam 
    }
  ];

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-12 w-96 bg-white rounded-lg shadow-lg p-2 z-50">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <h3 className="font-semibold text-gray-900">
          Notifications ({stats.total})
          {stats.unread > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
              {stats.unread} unread
            </span>
          )}
        </h3>
        <div className="flex items-center gap-3">
          {stats.unread > 0 && (
            <button 
              onClick={handleMarkAllAsRead}
              className="text-blue-600 text-sm font-medium hover:text-blue-700"
            >
              Mark all read
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-4 py-3 text-sm font-medium relative rounded-lg ${
              activeTab === tab.key
                ? 'text-white bg-blue-600'
                : 'text-gray-600 hover:text-gray-900 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.name}
            {tab.count > 0 && (
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.key
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2">Loading notifications...</p>
          </div>
        ) : getActiveNotifications().length > 0 ? (
          // <div>
          //   {getActiveNotifications().map((notification) => (
          //     <div
          //       key={notification.id}
          //       className={`px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 shadow-xl cursor-pointer transition-colors ${
          //         notification.isRead ? 'shadow-4xl' : 'bg-blue-50 border-blue-300'
          //       }`}
          //       onClick={() => handleNotificationClick(notification)}
          //     >
          //       <div className="flex items-center gap-3">
          //         <div className="flex-shrink-0 mt-1 bg-gray-50 rounded-full p-2">
          //           {getNotificationIcon(notification)}
          //         </div>
          //         {renderNotificationContent(notification)}
          //         <div className="flex-shrink-0 text-right">
          //           <p className="text-xs text-gray-500">
          //             {formatTimestamp(notification.timestamp)}
          //           </p>
          //           {!notification.isRead && (
          //             <div className="w-2 h-2 bg-blue-600 rounded-full mt-1 ml-auto"></div>
          //           )}
          //           {notification.priority === 'critical' && (
          //             <span className="inline-block mt-1 px-1.5 py-0.5 bg-red-600 text-white text-xs rounded-full">
          //               !
          //             </span>
          //           )}
          //         </div>
          //       </div>
          //     </div>
          //   ))}
          // </div>
          <div>
            {Object.entries(getGroupedNotifications()).map(([groupKey, notifications]) => {
              if (notifications.length === 0) return null;
              
              return (
                <div key={groupKey} className="mb-4">
                  {/* Group Header */}
                  <div className="sticky top-0 bg-gray-50 px-4 py-2 border-b border-gray-200">
                    <h4 className="text-xs font-semibold text-gray-700 tracking-wide">
                      {getGroupDisplayName(groupKey)} ({notifications.length})
                    </h4>
                  </div>
                  
                  {/* Group Notifications */}
                  <div>
                    {notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 cursor-pointer transition-colors ${
                          notification.isRead ? '' : 'bg-blue-50 border-blue-300'
                        }`}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 mt-1 bg-gray-50 rounded-full p-2">
                            {getNotificationIcon(notification)}
                          </div>
                          {renderNotificationContent(notification)}
                          <div className="flex-shrink-0 text-right">
                            <p className="text-xs text-gray-500">
                              {formatTimestamp(notification.timestamp)}
                            </p>
                            {!notification.isRead && (
                              <div className="w-2 h-2 bg-blue-600 rounded-full mt-1 ml-auto"></div>
                            )}
                            {notification.priority === 'critical' && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 bg-red-600 text-white text-xs rounded-full">
                                !
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p>No {activeTab} notifications</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsDropdown;
