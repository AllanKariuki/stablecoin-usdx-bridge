import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StaffEntry from '../pages/StaffEntry';

const { login } = vi.hoisted(() => ({ login: vi.fn() }));

vi.mock('@damp/web-shared/auth', () => ({
  useAuth: () => ({
    status: 'anonymous',
    user: null,
    permissions: new Set(),
    can: () => false,
    hasRole: () => false,
    login,
    register: vi.fn(),
    logout: () => {},
    reload: () => {},
  }),
}));

afterEach(() => {
  login.mockReset();
});

describe('staff entry', () => {
  it('shows the sign-in heading and the four workspaces for an anonymous visitor', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <StaffEntry />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /sign in to your workspace/i })).toBeInTheDocument();
    for (const label of ['Compliance', 'Treasury', 'Admin', 'Auditor']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('starts company sign-in when the button is clicked', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <StaffEntry />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /continue with company sign-in/i }));
    expect(login).toHaveBeenCalledWith({ returnTo: '/' });
  });
});
