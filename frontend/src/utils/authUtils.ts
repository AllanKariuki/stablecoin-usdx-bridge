import { getConfig } from "../Config";
import type { KeycloakUserInfo } from "../types/auth-and-websocket/auth";

export const sessionDuration = 1800; // 30 minutes
// const refreshInterval = 3 * 60 * 1000; // 3 minutes

// const generateCodeVerifier = () => {
//     const array = new Uint8Array(32);
//     crypto.getRandomValues(array);
//     return btoa(String.fromCharCode(...array))
//         .replace(/\+/g, '-')
//         .replace(/\//g, '_')
//         .replace(/=/g, '');
// };

// const generateCodeChallenge = async (verifier) => {
//     const encoder = new TextDecoder();
//     const data = encoder.encode(verifier);
//     const digest = await crypto.subtle.digest('SHA-256', data);
//     return btoa(String.fromCharCode(...new Uint8Array(digest)))
//         .replace(/\+/g, '-')
//         .replace(/\//g, '_')
//         .replace(/=/g, '');
// };

export const setSessionStartTime = () => {
    const startTime = new Date().getTime();
    sessionStorage.setItem('session_start_time', startTime.toString());
};

export const getToken = () => {
    const token = sessionStorage.getItem('token');
    if (token) {
        const tokenData = JSON.parse(token);
        if (Date.now() < tokenData.expiresAt) {
            return tokenData.accessToken;
        }
    }
    return null;
};

export const isSessionExpired = () => {
    const startTime = sessionStorage.getItem('session_start_time');
    if (!startTime) return true;
    const elapsedTime = (Date.now() - parseInt(startTime, 10))/ 1000;
    return elapsedTime > sessionDuration;
}

export const setToken = (accessToken: string) => {
    const expiresAt = Date.now() + sessionDuration * 1000;
    sessionStorage.setItem('token', JSON.stringify({ accessToken, expiresAt }));
};

export const setRefreshToken = (refreshToken: string) => {
    const expiresAt = Date.now() + sessionDuration * 1000;
    sessionStorage.setItem('refresh_token', JSON.stringify({ refreshToken, expiresAt }));
}

export const loginWithCridentials = async (username: string, password: string) => {
    const { VITE_KEYCLOAK_AUTHORITY, VITE_KEYCLOAK_CLIENT_ID } = getConfig();

    try {
        // ROPC: Resource Owner Password Credentials(enable in Keycloak)
        const response= await fetch(`${VITE_KEYCLOAK_AUTHORITY}/protocol/openid-connect/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'password',
                client_id: VITE_KEYCLOAK_CLIENT_ID,
                username: username,
                password: password,
                scope: 'openid profile email'
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error_description || 'Login failed');
        }

        const tokens = await response.json();

        // Store tokens and set sessions
        setToken(tokens.access_token);
        setRefreshToken(tokens.refresh_token);
        setSessionStartTime();

        return {
            success: true,
            tokens: tokens
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'An error occurred during login'
        }
    }
}

export const refreshAuthToken = async (currentRefreshToken: string) => {
    if (!currentRefreshToken) {
        throw new Error('No refresh token available');
    }

    const { VITE_KEYCLOAK_AUTHORITY, VITE_KEYCLOAK_CLIENT_ID } = getConfig();

    const response = await fetch(`${VITE_KEYCLOAK_AUTHORITY}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: currentRefreshToken,
            client_id: VITE_KEYCLOAK_CLIENT_ID,
            // scope: 'openid profile email'
        })
    });

    if (!response.ok) {
        throw new Error('Token refresh failed');
    }

    const data = await response.json();
    setToken(data.access_token);
    if (data.refresh_token) {
        setRefreshToken(data.refresh_token);
    }

    return data;
}


// Remove this function as it should be handled by the session monitor hook
// export const startTokenRefresh = () => {
//     setInterval(async () => {
//         const state = store.getState();
//         if (state.auth.isAuthenticated) {
//             if (isSessionExpired()) {
//                 store.dispatch(logout());
//             } else {
//                 try {
//                     await store.dispatch(refreshToken());
//                 } catch (error: any) {
//                     console.error('Token refresh failed: ', error);
//                 }
//             }
//         }
//     })
// };

export const decodeTokenPayload = (token: string) => {
    if (!token) return null;
    try {
        // Token validations
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid JWT token format');
        }

        const payload = parts[1];
        const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
        const decodedPayload = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(decodedPayload);
    } catch (error) {
        console.error('Error decoding token payload:', error);
        return null;
    }
}

export const decodeKeycloakToken = (token: string): KeycloakUserInfo | null => {
    if (!token) return null;

    try{
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64)
            .split('')
            .map((c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`)
            .join('')
        );

        return JSON.parse(jsonPayload);
    } catch (error: any) {
        console.error('Error decoding Keycloak token: ', error);
        return null;
    }
}

/**
 * DUMMY TESTS
 */
export const isAirlineUser = (user: KeycloakUserInfo | null): boolean => {
    if (!user) return false;

    return !!(user.organization || user.organization_name);
};

export const hasRole = (user: KeycloakUserInfo | null, role: string): boolean => {
    if (!user) return false;

    if (user.realm_access?.roles?.includes(role)) return true;

    if (user.resource_access) {
        for (const client in user.resource_access) {
            if (user.resource_access[client].roles?.includes(role)) {
                return true;
            }
        }
    }
    
    return false;
};

export const isSystemAdmin = (user: KeycloakUserInfo | null): boolean => {
    return hasRole(user, 'admin') || hasRole(user, 'system-admin') || hasRole(user, 'realm-admin');
};
export const getUserAirlineId = (user: KeycloakUserInfo | null): number | null => {
    if (!user) return null;

    if (user.airline_id) return user.airline_id;
    return null;
};
export const getUserAirlineName = (user: KeycloakUserInfo | null): string | null => {
    if (!user) return null;
    
    return user.airline_name || user.organization_name || null;
};

export const getUserOrganizationId = (user: KeycloakUserInfo | null): string | null => {
    if (!user) return null;
    
    return user.organization || null;
};
// DUMMY TESTS ENDS