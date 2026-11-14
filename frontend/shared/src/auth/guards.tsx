import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { Permission, Role } from './authz';
import { useAuth } from './AuthProvider';
import { FullPageLoader } from '../ui/Feedback';
import { ForbiddenPage } from '../pages/ErrorPages';

/** Sends anonymous visitors to Keycloak, remembering where they were going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, login } = useAuth();
  const location = useLocation();
  useEffect(() => {
    if (status === 'anonymous') void login({ returnTo: location.pathname + location.search });
  }, [status, login, location.pathname, location.search]);
  if (status !== 'authenticated') return <FullPageLoader label={status === 'loading' ? 'Checking your session' : 'Redirecting to sign in'} />;
  return <>{children}</>;
}

/**
 * Gates a whole app on holding at least one of `roles`. A customer who signs
 * in at the Ops Console lands on a legible "wrong place" page, not an empty
 * shell that 403s on every request.
 */
export function RequireRole({ roles, children, elsewhere }: { roles: Role[]; children: ReactNode; elsewhere?: { label: string; href: string } }) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) {
    return (
      <ForbiddenPage
        title="This app isn't for your account"
        message="You're signed in, but your account doesn't hold a role this app serves."
        action={elsewhere}
      />
    );
  }
  return <>{children}</>;
}

/** Route-level permission gate: renders the 403 page when the caller lacks all of `anyOf`. */
export function RequirePermission({ anyOf, children }: { anyOf: Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  return can(...anyOf) ? <>{children}</> : <ForbiddenPage />;
}

/**
 * Inline gate for a control. Absent, not disabled: the auditor workspace in
 * particular must contain no mutating control at all (frontend-ui-prd §7.5).
 */
export function Can({ anyOf, children, fallback = null }: { anyOf: Permission[]; children: ReactNode; fallback?: ReactNode }) {
  const { can } = useAuth();
  return <>{can(...anyOf) ? children : fallback}</>;
}
