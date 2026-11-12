import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { expandRoles, isRole, type Permission, type Role } from './authz';
import {
  accessTokenTtl,
  decodeClaims,
  getStoredAccessToken,
  logout as endSession,
  refreshSession,
  startLogin,
  type LoginOptions,
  type TokenClaims,
} from './session';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  orgId: string | null;
  roles: Role[];
}

export interface AuthContextValue {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: AuthUser | null;
  permissions: ReadonlySet<Permission>;
  can: (...anyOf: Permission[]) => boolean;
  hasRole: (...anyOf: Role[]) => boolean;
  login: (options?: LoginOptions) => Promise<void>;
  register: (options?: LoginOptions) => Promise<void>;
  logout: () => void;
  /** Re-reads tokens from storage — the callback page calls this after storing them. */
  reload: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const toUser = (claims: TokenClaims): AuthUser => ({
  id: claims.sub,
  name:
    claims.name ||
    [claims.given_name, claims.family_name].filter(Boolean).join(' ') ||
    claims.preferred_username ||
    claims.email ||
    'Signed-in user',
  email: claims.email ?? claims.preferred_username ?? '',
  orgId: claims.org_id ?? null,
  roles: (claims.realm_access?.roles ?? []).filter(isRole),
});

// Refresh this long before expiry so a request never leaves with a token
// that dies in flight.
const REFRESH_LEAD_MS = 45_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [claims, setClaims] = useState<TokenClaims | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');

  const reload = useCallback(() => {
    const token = getStoredAccessToken();
    if (token && accessTokenTtl() > 0) {
      setClaims(decodeClaims(token));
      setStatus('authenticated');
      return;
    }
    // Expired or missing access token: one refresh attempt before giving up.
    refreshSession().then((fresh) => {
      setClaims(fresh ? decodeClaims(fresh) : null);
      setStatus(fresh ? 'authenticated' : 'anonymous');
    });
  }, []);

  useEffect(reload, [reload]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const timer = window.setTimeout(() => {
      refreshSession().then((fresh) => {
        setClaims(fresh ? decodeClaims(fresh) : null);
        setStatus(fresh ? 'authenticated' : 'anonymous');
      });
    }, Math.max(accessTokenTtl() - REFRESH_LEAD_MS, 5_000));
    return () => window.clearTimeout(timer);
  }, [status, claims]);

  const value = useMemo<AuthContextValue>(() => {
    const user = claims ? toUser(claims) : null;
    const permissions = new Set(expandRoles(user?.roles ?? []));
    return {
      status,
      user,
      permissions,
      can: (...anyOf) => anyOf.some((p) => permissions.has(p)),
      hasRole: (...anyOf) => anyOf.some((r) => user?.roles.includes(r) ?? false),
      login: (options) => startLogin(options),
      register: (options) => startLogin({ ...options, register: true }),
      logout: endSession,
      reload,
    };
  }, [claims, status, reload]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
