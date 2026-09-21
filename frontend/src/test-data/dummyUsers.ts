/**
 * Dummy Users for Testing Airline-Specific Functionality
 * 
 * This file contains sample user data and JWT token payloads for testing
 * the airline-specific user access control features.
 * 
 * IMPORTANT: These are for TESTING ONLY. Do not use in production.
 */

import type { KeycloakUserInfo } from '../types/auth-and-websocket/auth';

/**
 * Dummy JWT Token Payloads
 * These represent the decoded payload of JWT tokens
 */

// ============================================================================
// SYSTEM ADMIN USER
// ============================================================================
export const ADMIN_USER_PAYLOAD: KeycloakUserInfo = {
  sub: "admin-uuid-12345",
  preferred_username: "admin@aats.com",
  name: "System Administrator",
  given_name: "System",
  family_name: "Administrator",
  email: "admin@aats.com",
  email_verified: true,
  realm_access: {
    roles: ["admin", "system-admin", "offline_access", "uma_authorization"]
  },
  resource_access: {
    "aats-portal": {
      roles: ["admin", "manage-airlines", "manage-aircraft", "manage-users"]
    }
  },
  exp: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
  iat: Math.floor(Date.now() / 1000),
  // No organization claims - admin sees everything
};

// ============================================================================
// KENYA AIRWAYS USER
// ============================================================================
export const KENYA_AIRWAYS_USER_PAYLOAD: KeycloakUserInfo = {
  sub: "kq-user-uuid-67890",
  preferred_username: "fleet.manager@kenya-airways.com",
  name: "James Mwangi",
  given_name: "James",
  family_name: "Mwangi",
  email: "fleet.manager@kenya-airways.com",
  email_verified: true,
  realm_access: {
    roles: ["airline-user", "fleet-manager", "offline_access"]
  },
  resource_access: {
    "aats-portal": {
      roles: ["view-fleet", "manage-aircraft"]
    }
  },
  // Organization claims
  organization: "org-kq-uuid-001",
  organization_name: "KQ", // IATA code
  airline_id: 1,
  airline_name: "Kenya Airways",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
};

// ============================================================================
// ETHIOPIAN AIRLINES USER
// ============================================================================
export const ETHIOPIAN_AIRLINES_USER_PAYLOAD: KeycloakUserInfo = {
  sub: "et-user-uuid-11223",
  preferred_username: "operations@ethiopianairlines.com",
  name: "Abebe Bekele",
  given_name: "Abebe",
  family_name: "Bekele",
  email: "operations@ethiopianairlines.com",
  email_verified: true,
  realm_access: {
    roles: ["airline-user", "operations-manager", "offline_access"]
  },
  resource_access: {
    "aats-portal": {
      roles: ["view-fleet", "view-operations"]
    }
  },
  // Organization claims
  organization: "org-et-uuid-002",
  organization_name: "ET", // IATA code
  airline_id: 4,
  airline_name: "Ethiopian Airlines",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
};

// ============================================================================
// EMIRATES USER
// ============================================================================
export const EMIRATES_USER_PAYLOAD: KeycloakUserInfo = {
  sub: "ek-user-uuid-44556",
  preferred_username: "maintenance@emirates.com",
  name: "Ahmed Al Maktoum",
  given_name: "Ahmed",
  family_name: "Al Maktoum",
  email: "maintenance@emirates.com",
  email_verified: true,
  realm_access: {
    roles: ["airline-user", "maintenance-manager", "offline_access"]
  },
  resource_access: {
    "aats-portal": {
      roles: ["view-fleet", "manage-maintenance"]
    }
  },
  // Organization claims
  organization: "org-ek-uuid-003",
  organization_name: "EK", // IATA code
  airline_id: 5,
  airline_name: "Emirates",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
};

// ============================================================================
// JAMBOJET USER (Subsidiary of Kenya Airways)
// ============================================================================
export const JAMBOJET_USER_PAYLOAD: KeycloakUserInfo = {
  sub: "jm-user-uuid-77889",
  preferred_username: "pilot@jambojet.com",
  name: "Mary Wanjiru",
  given_name: "Mary",
  family_name: "Wanjiru",
  email: "pilot@jambojet.com",
  email_verified: true,
  realm_access: {
    roles: ["airline-user", "pilot", "offline_access"]
  },
  resource_access: {
    "aats-portal": {
      roles: ["view-fleet", "view-flight-plans"]
    }
  },
  // Organization claims
  organization: "org-jm-uuid-004",
  organization_name: "JM", // IATA code
  airline_id: 2,
  airline_name: "Jambojet",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
};

// ============================================================================
// READ-ONLY AIRLINE USER (Limited Permissions)
// ============================================================================
export const READONLY_AIRLINE_USER_PAYLOAD: KeycloakUserInfo = {
  sub: "readonly-user-uuid-99001",
  preferred_username: "viewer@skywardexpress.com",
  name: "John Kamau",
  given_name: "John",
  family_name: "Kamau",
  email: "viewer@skywardexpress.com",
  email_verified: true,
  realm_access: {
    roles: ["airline-user", "viewer", "offline_access"]
  },
  resource_access: {
    "aats-portal": {
      roles: ["view-fleet"] // Only view permissions
    }
  },
  // Organization claims
  organization: "org-xw-uuid-005",
  organization_name: "XW", // IATA code (Skyward Express)
  airline_id: 3,
  airline_name: "Skyward Express",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a mock JWT token string from a payload
 * NOTE: This is NOT a real JWT - it's just for visual testing
 */
export const generateMockJWT = (payload: KeycloakUserInfo): string => {
  const header = { alg: "RS256", typ: "JWT" };
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const mockSignature = "mock-signature-" + Math.random().toString(36).substring(7);
  
  return `${encodedHeader}.${encodedPayload}.${mockSignature}`;
};

/**
 * Get all dummy users
 */
export const getAllDummyUsers = () => [
  {
    id: 'admin',
    name: 'System Administrator',
    email: 'admin@aats.com',
    type: 'admin',
    payload: ADMIN_USER_PAYLOAD,
    token: generateMockJWT(ADMIN_USER_PAYLOAD),
  },
  {
    id: 'kq-user',
    name: 'James Mwangi (Kenya Airways)',
    email: 'fleet.manager@kenya-airways.com',
    type: 'airline-user',
    airline: 'Kenya Airways',
    payload: KENYA_AIRWAYS_USER_PAYLOAD,
    token: generateMockJWT(KENYA_AIRWAYS_USER_PAYLOAD),
  },
  {
    id: 'et-user',
    name: 'Abebe Bekele (Ethiopian Airlines)',
    email: 'operations@ethiopianairlines.com',
    type: 'airline-user',
    airline: 'Ethiopian Airlines',
    payload: ETHIOPIAN_AIRLINES_USER_PAYLOAD,
    token: generateMockJWT(ETHIOPIAN_AIRLINES_USER_PAYLOAD),
  },
  {
    id: 'ek-user',
    name: 'Ahmed Al Maktoum (Emirates)',
    email: 'maintenance@emirates.com',
    type: 'airline-user',
    airline: 'Emirates',
    payload: EMIRATES_USER_PAYLOAD,
    token: generateMockJWT(EMIRATES_USER_PAYLOAD),
  },
  {
    id: 'jm-user',
    name: 'Mary Wanjiru (Jambojet)',
    email: 'pilot@jambojet.com',
    type: 'airline-user',
    airline: 'Jambojet',
    payload: JAMBOJET_USER_PAYLOAD,
    token: generateMockJWT(JAMBOJET_USER_PAYLOAD),
  },
  {
    id: 'readonly-user',
    name: 'John Kamau (Skyward Express - Read Only)',
    email: 'viewer@skywardexpress.com',
    type: 'airline-user-readonly',
    airline: 'Skyward Express',
    payload: READONLY_AIRLINE_USER_PAYLOAD,
    token: generateMockJWT(READONLY_AIRLINE_USER_PAYLOAD),
  },
];

/**
 * User credentials for testing (password is always "password123")
 */
export const DUMMY_USER_CREDENTIALS = {
  admin: {
    username: "admin@aats.com",
    password: "password123",
    payload: ADMIN_USER_PAYLOAD,
  },
  kenyaAirways: {
    username: "fleet.manager@kenya-airways.com",
    password: "password123",
    payload: KENYA_AIRWAYS_USER_PAYLOAD,
  },
  ethiopianAirlines: {
    username: "operations@ethiopianairlines.com",
    password: "password123",
    payload: ETHIOPIAN_AIRLINES_USER_PAYLOAD,
  },
  emirates: {
    username: "maintenance@emirates.com",
    password: "password123",
    payload: EMIRATES_USER_PAYLOAD,
  },
  jambojet: {
    username: "pilot@jambojet.com",
    password: "password123",
    payload: JAMBOJET_USER_PAYLOAD,
  },
  skywardExpress: {
    username: "viewer@skywardexpress.com",
    password: "password123",
    payload: READONLY_AIRLINE_USER_PAYLOAD,
  },
};

// ============================================================================
// EXPORT FOR TESTING
// ============================================================================
export default {
  users: getAllDummyUsers(),
  credentials: DUMMY_USER_CREDENTIALS,
  payloads: {
    admin: ADMIN_USER_PAYLOAD,
    kenyaAirways: KENYA_AIRWAYS_USER_PAYLOAD,
    ethiopianAirlines: ETHIOPIAN_AIRLINES_USER_PAYLOAD,
    emirates: EMIRATES_USER_PAYLOAD,
    jambojet: JAMBOJET_USER_PAYLOAD,
    skywardExpress: READONLY_AIRLINE_USER_PAYLOAD,
  },
};

