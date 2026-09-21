/**
 * Test Authentication Utilities
 * 
 * Helper functions to simulate different user logins for testing
 * the airline-specific user functionality.
 * 
 * IMPORTANT: FOR TESTING ONLY - DO NOT USE IN PRODUCTION
 */

import { 
  ADMIN_USER_PAYLOAD,
  KENYA_AIRWAYS_USER_PAYLOAD,
  ETHIOPIAN_AIRLINES_USER_PAYLOAD,
  EMIRATES_USER_PAYLOAD,
  JAMBOJET_USER_PAYLOAD,
  READONLY_AIRLINE_USER_PAYLOAD,
  generateMockJWT,
  DUMMY_USER_CREDENTIALS
} from './dummyUsers';
import type { KeycloakUserInfo } from '../types/auth-and-websocket/auth';

/**
 * Simulate login by setting auth data in sessionStorage
 * This mimics what happens during real authentication
 */
export const simulateLogin = (userType: 'admin' | 'kenyaAirways' | 'ethiopianAirlines' | 'emirates' | 'jambojet' | 'skywardExpress') => {
  let payload: KeycloakUserInfo;
  
  switch (userType) {
    case 'admin':
      payload = ADMIN_USER_PAYLOAD;
      break;
    case 'kenyaAirways':
      payload = KENYA_AIRWAYS_USER_PAYLOAD;
      break;
    case 'ethiopianAirlines':
      payload = ETHIOPIAN_AIRLINES_USER_PAYLOAD;
      break;
    case 'emirates':
      payload = EMIRATES_USER_PAYLOAD;
      break;
    case 'jambojet':
      payload = JAMBOJET_USER_PAYLOAD;
      break;
    case 'skywardExpress':
      payload = READONLY_AIRLINE_USER_PAYLOAD;
      break;
    default:
      payload = ADMIN_USER_PAYLOAD;
  }

  const mockToken = generateMockJWT(payload);
  const expiresAt = Date.now() + 3600 * 1000; // 1 hour from now

  // Set token in sessionStorage (mimics real auth flow)
  sessionStorage.setItem('token', JSON.stringify({
    accessToken: mockToken,
    expiresAt
  }));

  // Set refresh token
  sessionStorage.setItem('refresh_token', JSON.stringify({
    refreshToken: 'mock-refresh-token',
    expiresAt: Date.now() + 86400 * 1000 // 24 hours
  }));

  // Set session start time
  sessionStorage.setItem('session_start_time', Date.now().toString());

  console.log(`✅ Simulated login as ${userType}:`, payload);
  console.log('User details:', {
    name: payload.name,
    email: payload.email,
    roles: payload.realm_access?.roles,
    organization: payload.organization_name,
    airline: payload.airline_name
  });

  return payload;
};

/**
 * Simulate logout by clearing sessionStorage
 */
export const simulateLogout = () => {
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('refresh_token');
  sessionStorage.removeItem('session_start_time');
  console.log('✅ Simulated logout - session cleared');
};

/**
 * Get current simulated user info
 */
export const getCurrentSimulatedUser = (): KeycloakUserInfo | null => {
  const tokenData = sessionStorage.getItem('token');
  if (!tokenData) return null;

  try {
    const { accessToken } = JSON.parse(tokenData);
    const payload = accessToken.split('.')[1];
    const decodedPayload = JSON.parse(atob(payload));
    return decodedPayload;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};

/**
 * Check if user is currently logged in (simulated)
 */
export const isSimulatedUserLoggedIn = (): boolean => {
  const tokenData = sessionStorage.getItem('token');
  if (!tokenData) return false;

  try {
    const { expiresAt } = JSON.parse(tokenData);
    return Date.now() < expiresAt;
  } catch {
    return false;
  }
};

/**
 * Get all available test users
 */
export const getAvailableTestUsers = () => {
  return [
    {
      id: 'admin',
      label: 'System Administrator',
      description: 'Full access to all airlines and system settings',
      icon: '👨‍💼',
      color: 'red'
    },
    {
      id: 'kenyaAirways',
      label: 'Kenya Airways Fleet Manager',
      description: 'Can manage Kenya Airways fleet only',
      icon: '✈️',
      color: 'blue'
    },
    {
      id: 'ethiopianAirlines',
      label: 'Ethiopian Airlines Operations Manager',
      description: 'Can view Ethiopian Airlines operations',
      icon: '🛫',
      color: 'green'
    },
    {
      id: 'emirates',
      label: 'Emirates Maintenance Manager',
      description: 'Can manage Emirates maintenance',
      icon: '🔧',
      color: 'orange'
    },
    {
      id: 'jambojet',
      label: 'Jambojet Pilot',
      description: 'Can view Jambojet fleet and flight plans',
      icon: '👨‍✈️',
      color: 'purple'
    },
    {
      id: 'skywardExpress',
      label: 'Skyward Express Viewer',
      description: 'Read-only access to Skyward Express',
      icon: '👁️',
      color: 'gray'
    }
  ];
};

/**
 * Quick test function - call this in browser console to test different users
 */
export const testAsUser = (userType: 'admin' | 'kenyaAirways' | 'ethiopianAirlines' | 'emirates' | 'jambojet' | 'skywardExpress') => {
  console.log(`\n🧪 Testing as ${userType}...`);
  simulateLogin(userType);
  console.log('✅ Please refresh the page or navigate to /fleet/aircraft-registry to see changes');
  console.log('💡 Tip: Open Redux DevTools to see the auth state');
};

// Expose to window for easy console testing
if (typeof window !== 'undefined') {
  (window as any).testAsUser = testAsUser;
  (window as any).simulateLogin = simulateLogin;
  (window as any).simulateLogout = simulateLogout;
  (window as any).getCurrentUser = getCurrentSimulatedUser;
  
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           🧪 TEST AUTH UTILITIES LOADED                       ║
╠═══════════════════════════════════════════════════════════════╣
║  Available functions in browser console:                      ║
║                                                               ║
║  testAsUser('admin')              - Test as admin            ║
║  testAsUser('kenyaAirways')       - Test as KQ user          ║
║  testAsUser('ethiopianAirlines')  - Test as ET user          ║
║  testAsUser('emirates')           - Test as EK user          ║
║  testAsUser('jambojet')           - Test as JM user          ║
║  testAsUser('skywardExpress')     - Test as XW user          ║
║                                                               ║
║  simulateLogin(userType)          - Login as specific user   ║
║  simulateLogout()                 - Logout current user      ║
║  getCurrentUser()                 - Get current user info    ║
║                                                               ║
║  Example:                                                     ║
║    testAsUser('kenyaAirways')                                ║
║    // Then refresh or navigate to airlines page              ║
╚═══════════════════════════════════════════════════════════════╝
  `);
}

export default {
  simulateLogin,
  simulateLogout,
  getCurrentSimulatedUser,
  isSimulatedUserLoggedIn,
  getAvailableTestUsers,
  testAsUser,
  credentials: DUMMY_USER_CREDENTIALS
};

