import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Bank, BankAccount } from '@damp/web-shared/api/payments';
import BankAccountsTab from '../pages/payments/BankAccountsTab';
import HelpPage from '../pages/HelpPage';
import ProfileMenu from '../components/ProfileMenu';
import { renderSignedIn } from '../test/auth';

const { payments } = vi.hoisted(() => ({
  payments: { bankAccounts: vi.fn(), availableBanks: vi.fn(), registerBankAccount: vi.fn(), verifyBankAccount: vi.fn(), removeBankAccount: vi.fn() },
}));
vi.mock('@damp/web-shared/api/payments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@damp/web-shared/api/payments')>();
  return { ...actual, paymentsApi: { ...actual.paymentsApi, ...payments } };
});

const banks: Bank[] = [
  { id: 'bank_equity', name: 'Equity Bank', country: 'KE', currency: 'KES', swiftCode: '', rail: 'stub', logoUrl: null },
  { id: 'bank_mpesa', name: 'M-Pesa', country: 'KE', currency: 'KES', swiftCode: '', rail: 'mpesa', logoUrl: null },
];
const account = (patch: Partial<BankAccount>): BankAccount => ({
  id: 'ba-1',
  bankId: 'bank_equity',
  bankName: 'Equity Bank',
  accountName: 'Test User',
  accountNumberMasked: '•••• 9876',
  currency: 'KES',
  status: 'VERIFIED',
  isDefault: true,
  verifiedAt: null,
  ...patch,
});

describe('BankAccountsTab', () => {
  beforeEach(() => {
    Object.values(payments).forEach((fn) => fn.mockReset());
    payments.availableBanks.mockResolvedValue(banks);
    payments.bankAccounts.mockResolvedValue([
      account({}),
      account({ id: 'ba-m', bankId: 'bank_mpesa', bankName: 'M-Pesa', accountNumberMasked: '•••• 5678' }),
    ]);
    payments.registerBankAccount.mockResolvedValue(account({ id: 'ba-new' }));
  });

  it('splits bank accounts from M-Pesa numbers by the institution rail', async () => {
    const user = userEvent.setup();
    renderSignedIn(<BankAccountsTab />);
    expect(await screen.findByText('•••• 9876')).toBeInTheDocument();
    expect(screen.queryByText('•••• 5678')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /mobile money/i }));
    expect(await screen.findByText('•••• 5678')).toBeInTheDocument();
    expect(screen.queryByText('•••• 9876')).not.toBeInTheDocument();
  });

  it('adds an M-Pesa number against the M-Pesa institution, validating the number', async () => {
    const user = userEvent.setup();
    renderSignedIn(<BankAccountsTab />);
    await user.click(await screen.findByRole('tab', { name: /mobile money/i }));
    await user.click(screen.getByRole('button', { name: /add m-pesa number/i }));
    await user.type(await screen.findByLabelText(/^m-pesa number/i), '0712');
    await user.click(screen.getByRole('button', { name: /add number/i }));
    expect(await screen.findByText(/safaricom number/i)).toBeInTheDocument();
    expect(payments.registerBankAccount).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/^m-pesa number/i));
    await user.type(screen.getByLabelText(/^m-pesa number/i), '254712345678');
    await user.click(screen.getByRole('button', { name: /add number/i }));
    await waitFor(() =>
      expect(payments.registerBankAccount).toHaveBeenCalledWith({ bankId: 'bank_mpesa', accountName: '', accountNumber: '254712345678', currency: 'KES' }),
    );
  });

  it('lists available institutions with how each moves money', async () => {
    const user = userEvent.setup();
    renderSignedIn(<BankAccountsTab />);
    await user.click(await screen.findByRole('tab', { name: /available institutions/i }));
    const list = await screen.findByRole('list');
    expect(within(list).getByText('M-Pesa')).toBeInTheDocument();
    expect(within(list).getByText('Mobile money')).toBeInTheDocument();
    expect(within(list).getByText('Bank transfer')).toBeInTheDocument();
  });
});

describe('ProfileMenu', () => {
  it('opens with the account links and closes on Escape', async () => {
    const user = userEvent.setup();
    renderSignedIn(<ProfileMenu />);
    await user.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /help/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('HelpPage', () => {
  it('filters answers by search and says when nothing matches', async () => {
    const user = userEvent.setup();
    renderSignedIn(<HelpPage />);
    await user.type(screen.getByLabelText(/search help/i), 'M-Pesa');
    expect(screen.getByText(/how do i deposit with m-pesa/i)).toBeInTheDocument();
    expect(screen.queryByText(/what backs usd-x/i)).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText(/search help/i));
    await user.type(screen.getByLabelText(/search help/i), 'zzzz');
    expect(screen.getByText(/nothing matches/i)).toBeInTheDocument();
  });
});
