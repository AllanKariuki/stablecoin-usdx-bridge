import { describe, expect, it, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { AppShell } from '@damp/web-shared/layout';
import { PORTAL_NAV } from '../nav';
import { renderSignedIn } from '../test/auth';

const navLabels = async () => {
  const nav = (await screen.findAllByRole('navigation', { name: 'Main' }))[0];
  return within(nav).getAllByRole('link').map((a) => a.textContent);
};

describe('portal navigation', () => {
  beforeEach(() => sessionStorage.clear());

  it('shows a customer their money screens and no approvals inbox', async () => {
    renderSignedIn(<AppShell appName="Self-Service" nav={PORTAL_NAV}><p>body</p></AppShell>, ['customer'], '/home');
    const labels = await navLabels();
    expect(labels).toEqual(expect.arrayContaining(['Home', 'Wallets', 'USD-X', 'Payments', 'Verification']));
    expect(labels).not.toContain('Approvals');
  });

  it('only lists Approvals for a role that can decide them', async () => {
    renderSignedIn(<AppShell appName="Self-Service" nav={PORTAL_NAV}><p>body</p></AppShell>, ['admin'], '/home');
    expect(await navLabels()).toContain('Approvals');
  });
});
