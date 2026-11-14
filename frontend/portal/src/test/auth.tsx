import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, type Role } from '@damp/web-shared/auth';

const b64url = (value: object) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Stores an unsigned token for `roles` the way the PKCE callback would, so AuthProvider picks it up. */
export function signInAs(roles: Role[], claims: Record<string, unknown> = {}) {
  const payload = { sub: 'user-1', email: 'test@damp.local', name: 'Test User', exp: Math.floor(Date.now() / 1000) + 3600, realm_access: { roles }, ...claims };
  sessionStorage.setItem('damp.access_token', `${b64url({ alg: 'none' })}.${b64url(payload)}.sig`);
}

export function renderSignedIn(ui: ReactElement, roles: Role[] = ['customer'], path = '/') {
  signInAs(roles);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  );
}
