

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { restoreSession, selectUser } from '../../redux/slices/oauth-web-sockets/authSlice';
import { simulateLogin, simulateLogout, getAvailableTestUsers } from '../../test-data/testAuthUtils';
import type { AppDispatch } from '../../redux/store';
import { Users, ChevronDown, LogOut, RefreshCw } from 'lucide-react';

const UserSwitcher: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const currentUser = useSelector(selectUser);

  const testUsers = getAvailableTestUsers();

  const handleUserSwitch = async (userId: string) => {
    // Simulate login with selected user
    simulateLogin(userId as any);
    
    // Restore session to load the new user into Redux
    await dispatch(restoreSession());
    
    // Close dropdown
    setIsOpen(false);
    
    // Navigate to airlines page to see the effect
    navigate('/fleet/aircraft-registry');
    
    // Show success message
    console.log(`✅ Switched to ${userId}`);
  };

  const handleLogout = () => {
    simulateLogout();
    setIsOpen(false);
    window.location.reload();
  };

  if (!isVisible) {
    // Show minimal floating button when hidden
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 p-3 bg-purple-600 text-white rounded-full shadow-lg hover:bg-purple-700 transition-all z-50"
        title="Show User Switcher"
      >
        <Users className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              <span className="font-semibold text-sm">Test User Switcher</span>
            </div>
            <button
              onClick={() => setIsVisible(false)}
              className="text-white hover:text-gray-200"
              title="Hide"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Current User Display */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="text-xs text-gray-500 mb-1">Current User:</div>
          {currentUser ? (
            <div className="space-y-1">
              <div className="font-semibold text-sm text-gray-900">{currentUser.name || 'Unknown'}</div>
              <div className="text-xs text-gray-600">{currentUser.email || 'No email'}</div>
              {currentUser.airline_name && (
                <div className="text-xs text-blue-600 font-medium">
                  🏢 {currentUser.airline_name} ({currentUser.organization_name})
                </div>
              )}
              {currentUser.realm_access?.roles && (
                <div className="text-xs text-gray-500">
                  Roles: {currentUser.realm_access.roles.slice(0, 2).join(', ')}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">No user logged in</div>
          )}
        </div>

        {/* User Selection Dropdown */}
        <div className="p-4">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
          >
            <span className="text-sm font-medium text-blue-900">Switch User</span>
            <ChevronDown className={`w-4 h-4 text-blue-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isOpen && (
            <div className="mt-2 max-h-80 overflow-y-auto border border-gray-200 rounded-md shadow-lg bg-white">
              {testUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleUserSwitch(user.id)}
                  className={`w-full px-3 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors ${
                    currentUser?.preferred_username?.includes(user.id) ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xl" style={{ minWidth: '24px' }}>{user.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 mb-0.5">{user.label}</div>
                      <div className="text-xs text-gray-600">{user.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 space-y-2">
          <button
            onClick={async () => {
              await dispatch(restoreSession());
              console.log('✅ Session restored');
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-md hover:bg-green-100 transition-colors text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Session
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-md hover:bg-red-100 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>

        {/* Warning */}
        <div className="px-4 pb-3">
          <div className="bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2">
            <div className="text-xs text-yellow-800">
              ⚠️ <strong>Testing Only</strong> - Remove in production
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserSwitcher;

