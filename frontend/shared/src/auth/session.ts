import { getConfig } from '../config';

/**
 * Keycloak authorization-code + PKCE (RFC 7636), with no first-party
 * credential form anywhere: the only place a password is typed is
 * Keycloak's own hosted page (themed by infra/keycloak/themes/damp).
 *
 * Tokens live in sessionStorage, scoped to the tab. Expiry is taken from
 * the token's own `exp`, not a fixed client-side guess — Keycloak's access
 * token lifespan is 300s (damp-realm.json) and a client that believed 30
 * minutes would keep sending dead tokens.
 */

const KEYS = {
  access: 'damp.access_token',
  refresh: 'damp.refresh_token',
  id: 'damp.id_token',
  verifier: 'damp.pkce_verifier',
  state: 'damp.pkce_state',
  returnTo: 'damp.return_to',
} as const;

export interface TokenClaims {
  sub: string;
  exp: number;
  iat?: number;
  email?: string;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  org_id?: string;
  realm_access?: { roles?: string[] };
  [claim: string]: unknown;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
}

const b64url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const randomString = (size: number) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
};

// S256 is the only method the realm's clients accept; "plain" would send the
// verifier over the wire twice.
const challengeFor = async (verifier: string) =>
  b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

export function decodeClaims(token: string | null): TokenClaims | null {
  if (!token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
    const json = decodeURIComponent(
      Array.from(atob(padded), (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
    );
    return JSON.parse(json) as TokenClaims;
  } catch {
    return null;
  }
}

const expiresAt = (token: string | null) => (decodeClaims(token)?.exp ?? 0) * 1000;

export const getAccessToken = (): string | null => {
  const token = sessionStorage.getItem(KEYS.access);
  return token && expiresAt(token) > Date.now() ? token : null;
};

/** The raw stored token even when expired — refresh decides what to do with it. */
export const getStoredAccessToken = () => sessionStorage.getItem(KEYS.access);
export const getRefreshToken = () => sessionStorage.getItem(KEYS.refresh);
export const getIdToken = () => sessionStorage.getItem(KEYS.id);

/** Milliseconds until the access token expires (negative once it has). */
export const accessTokenTtl = () => expiresAt(sessionStorage.getItem(KEYS.access)) - Date.now();

export function storeTokens(tokens: TokenSet) {
  sessionStorage.setItem(KEYS.access, tokens.access_token);
  if (tokens.refresh_token) sessionStorage.setItem(KEYS.refresh, tokens.refresh_token);
  if (tokens.id_token) sessionStorage.setItem(KEYS.id, tokens.id_token);
}

export function clearTokens() {
  for (const key of [KEYS.access, KEYS.refresh, KEYS.id]) sessionStorage.removeItem(key);
}

export interface LoginOptions {
  /** App path to land on after the callback. Defaults to the current location. */
  returnTo?: string;
  /** Opens Keycloak's registration page instead of the login page. */
  register?: boolean;
  /** Pre-fills the username on Keycloak's form. */
  loginHint?: string;
}

export async function startLogin(options: LoginOptions = {}): Promise<void> {
  const cfg = getConfig();
  const verifier = randomString(32);
  const state = randomString(16);
  sessionStorage.setItem(KEYS.verifier, verifier);
  sessionStorage.setItem(KEYS.state, state);
  sessionStorage.setItem(KEYS.returnTo, options.returnTo ?? window.location.pathname + window.location.search);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.VITE_KEYCLOAK_CLIENT_ID,
    redirect_uri: cfg.VITE_REDIRECT_URI,
    scope: 'openid profile email',
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
    state,
  });
  if (options.loginHint) params.set('login_hint', options.loginHint);
  // Keycloak serves its registration form from a sibling endpoint that takes
  // the same parameters, so sign-up is the same PKCE round trip.
  const endpoint = options.register ? 'registrations' : 'auth';
  window.location.assign(`${cfg.VITE_KEYCLOAK_AUTHORITY}/protocol/openid-connect/${endpoint}?${params}`);
}

export type CallbackResult = { ok: true; returnTo: string } | { ok: false; error: string };

/**
 * Finishes the round trip startLogin began. The `state` check is the CSRF /
 * mix-up defence (RFC 6749 §10.12); the verifier proves this tab started it.
 */
export async function completeLogin(search: string): Promise<CallbackResult> {
  const params = new URLSearchParams(search);
  const error = params.get('error');
  if (error) return { ok: false, error: params.get('error_description') || error };

  const code = params.get('code');
  const state = params.get('state');
  const expected = sessionStorage.getItem(KEYS.state);
  const verifier = sessionStorage.getItem(KEYS.verifier);
  const returnTo = sessionStorage.getItem(KEYS.returnTo) || '/';
  sessionStorage.removeItem(KEYS.state);
  sessionStorage.removeItem(KEYS.verifier);
  sessionStorage.removeItem(KEYS.returnTo);

  if (!code) return { ok: false, error: 'The sign-in response had no authorization code.' };
  if (!expected || state !== expected) return { ok: false, error: 'This sign-in link was already used or came from another tab.' };
  if (!verifier) return { ok: false, error: 'This tab did not start the sign-in. Please try again.' };

  const cfg = getConfig();
  try {
    const response = await fetch(`${cfg.VITE_KEYCLOAK_AUTHORITY}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: cfg.VITE_KEYCLOAK_CLIENT_ID,
        redirect_uri: cfg.VITE_REDIRECT_URI,
        code,
        code_verifier: verifier,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { ok: false, error: body.error_description || 'Keycloak refused the sign-in.' };
    }
    storeTokens(await response.json());
    return { ok: true, returnTo: returnTo.startsWith('/auth/') ? '/' : returnTo };
  } catch {
    return { ok: false, error: 'Could not reach the sign-in server.' };
  }
}

let inflightRefresh: Promise<string | null> | null = null;

/**
 * Exchanges the refresh token for a new access token. Concurrent callers
 * (several 401s at once) share one request — Keycloak rotates refresh
 * tokens, so two parallel refreshes would invalidate each other.
 */
export function refreshSession(): Promise<string | null> {
  if (inflightRefresh) return inflightRefresh;
  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(null);
  const cfg = getConfig();
  inflightRefresh = fetch(`${cfg.VITE_KEYCLOAK_AUTHORITY}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: cfg.VITE_KEYCLOAK_CLIENT_ID }),
  })
    .then(async (response) => {
      if (!response.ok) {
        clearTokens();
        return null;
      }
      const tokens = (await response.json()) as TokenSet;
      storeTokens(tokens);
      return tokens.access_token;
    })
    .catch(() => null)
    .finally(() => {
      inflightRefresh = null;
    });
  return inflightRefresh;
}

/**
 * Ends the Keycloak SSO session too, not just this tab's — clearing
 * sessionStorage alone leaves Keycloak's cookie live and the next /auth
 * redirect would silently sign the user straight back in.
 */
export function logout() {
  const cfg = getConfig();
  const idToken = getIdToken();
  clearTokens();
  const params = new URLSearchParams({ post_logout_redirect_uri: cfg.VITE_KEYCLOAK_POSTLOGOUT_URI, client_id: cfg.VITE_KEYCLOAK_CLIENT_ID });
  if (idToken) params.set('id_token_hint', idToken);
  window.location.assign(`${cfg.VITE_KEYCLOAK_AUTHORITY}/protocol/openid-connect/logout?${params}`);
}

/** Keycloak's account console, where MFA, password and sessions are managed. */
export const accountConsoleUrl = () => `${getConfig().VITE_KEYCLOAK_AUTHORITY}/account`;
