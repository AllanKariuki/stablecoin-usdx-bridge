import React, { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectNotificationStats } from '../../redux/slices/navigation/unifiedNotificationsSlice';
import NotificationsDropdown from './NotificationsDropdown';

interface NotificationBellProps {
  variant?: 'light' | 'dark';
  className?: string;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ 
  variant = 'light', 
  className = '' 
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const stats = useSelector(selectNotificationStats);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const baseClasses = variant === 'dark' 
    ? 'rounded-full bg-black/20 p-2 cursor-pointer hover:bg-black/30 transition-colors'
    : 'rounded-full bg-gray-50 p-2 cursor-pointer hover:bg-gray-100 transition-colors';

  const bellIconClasses = variant === 'dark'
    ? 'text-white w-5 h-5'
    : 'text-gray-500 w-5 h-5 hover:text-gray-700';

  return (
    <div ref={bellRef} className={`relative ${className}`}>
      <div 
        className={`${baseClasses} ${className}`}
        onClick={toggleDropdown}
        aria-label={`Notifications (${stats.unread} unread)`}
      >
        <Bell className={bellIconClasses} />
        
        {/* Notification badge */}
        {stats.unread > 0 && (
          <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-medium leading-none">
              {stats.unread > 99 ? '99+' : stats.unread}
            </span>
          </div>
        )}

        {/* Critical notification pulse indicator */}
        {stats.byPriority.critical > 0 && (
          <div className="absolute -top-1 -right-1 w-4 h-4">
            <div className="animate-ping absolute w-full h-full bg-red-400 rounded-full opacity-75"></div>
            <div className="relative w-full h-full bg-red-500 rounded-full"></div>
          </div>
        )}
      </div>

      {/* Dropdown */}
      <NotificationsDropdown 
        isOpen={isDropdownOpen} 
        onClose={() => setIsDropdownOpen(false)}
      />
    </div>
  );
};

export default NotificationBell;
