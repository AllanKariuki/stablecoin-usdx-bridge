import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { approvalsApi, ledgerApi, type Transaction, type Wallet } from '@damp/web-shared/api';
import { AuthProvider } from '@damp/web-shared/auth';
import WalletDetail from '../pages/WalletDetail';
import TransactionDetail from '../pages/TransactionDetail';
import Approvals from '../pages/Approvals';
import { LegVerdict } from '../components/LegStatus';
import { WorkspaceProvider, WorkspaceSwitcher } from '../workspaces';

const money = (display: string, amount = '100.00') => ({ amount, currency: 'USD', decimals: 2, display });

const wallet: Wallet = {
  id: 'wal-1',
  userId: 'cust-1',
  currency: 'USD',
  chain: '',
  address: '',
  status: 'ACTIVE',
  label: 'Main',
  balance: money('$100.00'),
};

const transaction: Transaction = {
  id: 'tx-1',
  type: 'DEPOSIT',
  status: 'POSTED',
  reversed: false,
  valueDate: '2026-11-01',
  description: 'Card deposit',
  externalRef: 'ref-1',
  createdAt: '2026-11-01T10:00:00Z',
  entries: [
    { lineNo: 1, accountId: '2100.USD.wal-1', direction: 'CREDIT', currency: 'USD', amount: money('$100.00'), runningBalance: money('$100.00'), description: '' },
    { lineNo: 2, accountId: '1000.USD', direction: 'DEBIT', currency: 'USD', amount: money('$100.00'), runningBalance: money('$100.00'), description: '' },
  ],
};

const b64url = (value: object) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A token AuthProvider will accept from sessionStorage; nothing verifies its signature client-side. */
function signInAs(...roles: string[]) {
  const token = [b64url({ alg: 'none' }), b64url({ sub: 'staff-1', name: 'Test Staff', exp: Math.floor(Date.now() / 1000) + 3600, realm_access: { roles } }), 'sig'].join('.');
  sessionStorage.setItem('damp.access_token', token);
}

function renderAt(path: string, element: React.ReactNode, route: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const MUTATING = /freeze|unfreeze|reverse|approve|reject|close|dismiss|publish|prepare|assign|edit|fetch statement/i;

beforeEach(() => {
  vi.spyOn(ledgerApi, 'wallet').mockResolvedValue(wallet);
  vi.spyOn(ledgerApi, 'statement').mockResolvedValue({ walletId: 'wal-1', currency: 'USD', entries: [] });
  vi.spyOn(ledgerApi, 'transaction').mockResolvedValue(transaction);
});

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('auditor workspace is read-only', () => {
  it('shows no action buttons on wallet detail for an auditor-only user', async () => {
    signInAs('auditor');
    renderAt('/wallets/wal-1', <WalletDetail />, '/wallets/:walletId');
    await screen.findByRole('heading', { name: /main wallet/i });
    const buttons = screen.queryAllByRole('button').map((b) => b.textContent ?? '');
    expect(buttons.filter((t) => MUTATING.test(t))).toEqual([]);
  });

  it('shows no action buttons on transaction detail for an auditor-only user', async () => {
    signInAs('auditor');
    renderAt('/transactions/tx-1', <TransactionDetail />, '/transactions/:transactionId');
    await screen.findByRole('heading', { name: /card deposit/i });
    const buttons = screen.queryAllByRole('button').map((b) => b.textContent ?? '');
    expect(buttons.filter((t) => MUTATING.test(t))).toEqual([]);
  });

  it('shows no decide buttons on an approval for an auditor-only user', async () => {
    signInAs('auditor');
    vi.spyOn(approvalsApi, 'list').mockResolvedValue([
      {
        id: 'apr-1',
        action: 'PAYOUT',
        subjectType: 'PAYOUT',
        subjectId: 'po-1',
        payloadDigest: 'sha256:abc',
        summary: { amount: '$10.00' },
        requestedBy: 'someone-else',
        reason: 'test',
        status: 'PENDING',
        approvals: [],
        expiresAt: '2026-12-01T00:00:00Z',
      },
    ]);
    vi.spyOn(approvalsApi, 'policies').mockResolvedValue([]);
    renderAt('/approvals', <Approvals />, '/approvals');
    fireEvent.click(await screen.findByText('Payout'));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('What you are approving')).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: /approve|reject/i })).toBeNull();
  });

  // Positive controls: the same screens do show the actions to roles that
  // hold the permission, so the assertions above aren't vacuous.
  it('shows Freeze to compliance and Reverse to treasury', async () => {
    signInAs('compliance');
    const { unmount } = renderAt('/wallets/wal-1', <WalletDetail />, '/wallets/:walletId');
    expect(await screen.findByRole('button', { name: /freeze wallet/i })).toBeInTheDocument();
    unmount();

    signInAs('treasury');
    renderAt('/transactions/tx-1', <TransactionDetail />, '/transactions/:transactionId');
    expect(await screen.findByRole('button', { name: /reverse/i })).toBeInTheDocument();
  });
});

describe('reconciliation legs', () => {
  it('never renders an unevaluated leg as a pass', () => {
    render(<LegVerdict ok={null} />);
    expect(screen.getByText('Not evaluated')).toBeInTheDocument();
    expect(screen.queryByText('Pass')).toBeNull();
  });
});

describe('workspace switcher', () => {
  it('offers a choice only to users with more than one staff role', async () => {
    signInAs('compliance', 'auditor');
    render(
      <MemoryRouter>
        <AuthProvider>
          <WorkspaceProvider>
            <WorkspaceSwitcher />
          </WorkspaceProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    const group = await screen.findByRole('radiogroup', { name: 'Workspace' });
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Compliance', 'Auditor']);
  });
});
