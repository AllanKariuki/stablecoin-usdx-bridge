import { getConfig } from "../Config";
import type { KeycloakUserInfo } from "../types/auth-and-websocket/auth";

export const sessionDuration = 1800; // 30 minutes
// const refreshInterval = 3 * 60 * 1000; // 3 minutes

// base64url without padding — the encoding PKCE (RFC 7636) and Keycloak's
// `state` param both expect; plain base64's '+', '/', '=' are not
// URL-safe and would need re-escaping in the query string anyway.
const base64UrlEncode = (bytes: Uint8Array): string => {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
};

const generateCodeVerifier = (): string => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64UrlEncode(array);
};

// S256 per RFC 7636 §4.2 — the only method damp-portal's client config
// accepts (pkce.code.challenge.method: S256 in
// infra/keycloak/templates/damp-realm.template.json). "plain" exists in the
// spec but defeats the point: the verifier would be sent over the wire
// twice, once as itself.
const generateCodeChallenge = async (verifier: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(digest));
};

const generateState = (): string => {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return base64UrlEncode(array);
};

const PKCE_VERIFIER_KEY = 'pkce_code_verifier';
const PKCE_STATE_KEY = 'pkce_state';

/**
 * Redirects the browser to Keycloak's authorization endpoint to start the
 * auth-code + PKCE flow — the P1 replacement for loginWithCridentials'
 * grant_type:'password' (see docs/building-plan.md's P1 note: the
 * password-grant flow stays available at the Keycloak client level as a
 * fallback during migration, via directAccessGrantsEnabled, but this is the
 * flow the login UI drives going forward).
 *
 * The verifier and state are stashed in sessionStorage — not the redirect
 * URL itself — so they survive the full-page navigation to Keycloak and
 * back without ever appearing in browser history or a referrer header.
 */
export const startPkceLogin = async (): Promise<void> => {
    const { VITE_KEYCLOAK_AUTHORITY, VITE_KEYCLOAK_CLIENT_ID, VITE_REDIRECT_URI } = getConfig();

    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();

    sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
    sessionStorage.setItem(PKCE_STATE_KEY, state);

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: VITE_KEYCLOAK_CLIENT_ID,
        redirect_uri: VITE_REDIRECT_URI,
        scope: 'openid profile email',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
    });

    window.location.assign(`${VITE_KEYCLOAK_AUTHORITY}/protocol/openid-connect/auth?${params.toString()}`);
};

/**
 * Completes the flow startPkceLogin began: verifies the callback's `state`
 * matches what was stashed (CSRF/mix-up protection — RFC 6749 §10.12),
 * exchanges the authorization code for tokens using the *verifier* Keycloak
 * never saw, and stores them exactly like loginWithCridentials did so every
 * downstream consumer (axios.ts's interceptor, restoreSession) needs no
 * changes.
 */
export const completePkceLogin = async (
    code: string,
    returnedState: string,
): Promise<{ success: true; tokens: any } | { success: false; error: string }> => {
    const expectedState = sessionStorage.getItem(PKCE_STATE_KEY);
    const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
    sessionStorage.removeItem(PKCE_STATE_KEY);
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);

    if (!expectedState || returnedState !== expectedState) {
        return { success: false, error: 'Login state mismatch — please try signing in again.' };
    }
    if (!verifier) {
        return { success: false, error: 'Missing PKCE verifier — please try signing in again.' };
    }

    const { VITE_KEYCLOAK_AUTHORITY, VITE_KEYCLOAK_CLIENT_ID, VITE_REDIRECT_URI } = getConfig();

    try {
        const response = await fetch(`${VITE_KEYCLOAK_AUTHORITY}/protocol/openid-connect/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: VITE_KEYCLOAK_CLIENT_ID,
                redirect_uri: VITE_REDIRECT_URI,
                code,
                code_verifier: verifier,
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error_description || 'Login failed');
        }

        const tokens = await response.json();
        setToken(tokens.access_token);
        setRefreshToken(tokens.refresh_token);
        if (tokens.id_token) {
            setIdToken(tokens.id_token);
        }
        setSessionStartTime();

        return { success: true, tokens };
    } catch (error: any) {
        return { success: false, error: error.message || 'An error occurred during login' };
    }
};

/**
 * Ends the Keycloak SSO session (not just the local one) and returns the
 * browser to VITE_KEYCLOAK_POSTLOGOUT_URI. Plain sessionStorage.clear() —
 * what logout() in authSlice.ts does — ends this tab's session but leaves
 * Keycloak's own SSO cookie live, so a fresh /auth redirect silently
 * re-authenticates the user without a login prompt. id_token_hint tells
 * Keycloak which SSO session to end without an extra confirmation screen.
 */
export const logoutRedirect = (idToken?: string): void => {
    const { VITE_KEYCLOAK_AUTHORITY, VITE_KEYCLOAK_POSTLOGOUT_URI } = getConfig();
    const params = new URLSearchParams({ post_logout_redirect_uri: VITE_KEYCLOAK_POSTLOGOUT_URI });
    if (idToken) {
        params.set('id_token_hint', idToken);
    }
    window.location.assign(`${VITE_KEYCLOAK_AUTHORITY}/protocol/openid-connect/logout?${params.toString()}`);
};

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

// The id_token exists only to hand back to Keycloak's logout endpoint as
// id_token_hint (see logoutRedirect below) — it is never sent to any API
// this app calls, which use the access token exclusively.
export const setIdToken = (idToken: string) => {
    sessionStorage.setItem('id_token', idToken);
};

export const getIdToken = (): string | null => sessionStorage.getItem('id_token');

export const clearIdToken = () => sessionStorage.removeItem('id_token');

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
        if (tokens.id_token) {
            setIdToken(tokens.id_token);
        }
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