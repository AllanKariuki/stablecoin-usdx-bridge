import React from 'react'
import { useSelector } from 'react-redux';
import { logout, selectUser } from '../../redux/slices/oauth-web-sockets/authSlice';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import Dropdown from '../general/Dropdown';
import DropdownItem from '../general/DropdownItem';
import { LogOut, Mail, User } from 'lucide-react';

interface UserCircleProps {
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

const UserCircle: React.FC<UserCircleProps> = ({
    size = 'md',
    className = ''
}) => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const user = useSelector(selectUser) || {
        given_name: 'Guest',
        family_name: '',
        email: 'guest@example.com'
    };
    const getInitials = (user: any): string => {
        const firstIntial = user.given_name?.charAt(0).toUpperCase() || '';
        const lastInitial = user.family_name?.charAt(0).toUpperCase() || '';
        return `${firstIntial}${lastInitial}`;
    };

    // size variants
    const sizeClasses = {
        sm: 'w-8 h-8 text-xs',
        md: 'w-9 h-9 text-sm',
        lg: 'w-12 h-12 text-base',
        xl: 'w-16 h-16 text-lg'
    };

    const initials = getInitials(user);
    const fullName = `${user?.given_name || ''} ${user?.family_name || ''}`.trim();
    const handleProfileClick = () => {
        navigate('/profile');
    };

    const handleLogout = () => {
        dispatch(logout());
    };

    const userCircle = (
        <div
            className={`
            ${sizeClasses[size]}
            bg-blue-100
            text-blue-800
            rounded-full
            flex
            items-center
            justify-center
            font-semibold
            select-none
            hover:bg-blue-200
            hover:shadow-sm
            cursor-pointer
            transition-colors
            ${className}
            `}
            title={`${user?.given_name} ${user?.family_name}`}
            >
            {initials}
        </div>
    )

  return (
    <Dropdown trigger={userCircle} align='right'>
        {/* User Info Header */}
            <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center space-x-3">
                    <div className={`
                        ${sizeClasses.lg}
                        bg-blue-100
                        text-blue-800
                        rounded-full
                        flex
                        items-center
                        justify-center
                        font-semibold
                        select-none
                    `}>
                        {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                            {fullName || 'Guest User'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                            {user?.email || 'No email available'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Menu Items */}
            <div className="py-1">
                <DropdownItem 
                    icon={<User className="w-4 h-4" />}
                    onClick={handleProfileClick}
                >
                    <div>
                        <div className="font-medium">Profile</div>
                        <div className="text-xs text-gray-500">View and edit profile</div>
                    </div>
                </DropdownItem>

                <DropdownItem 
                    icon={<Mail className="w-4 h-4" />}
                    onClick={() => {/* Handle email/contact action */}}
                >
                    <div>
                        <div className="font-medium">Inbox</div>
                        <div className="text-xs text-gray-500">View messages sent to you</div>
                    </div>
                </DropdownItem>

                {/* Separator */}
                <div className="border-t border-gray-100 my-1"></div>

                <DropdownItem 
                    icon={<LogOut className="w-4 h-4" />}
                    onClick={handleLogout}
                    variant="danger"
                >
                    <div className="font-medium">Sign out</div>
                </DropdownItem>
            </div>
    </Dropdown>
  )
}

export default UserCircle
