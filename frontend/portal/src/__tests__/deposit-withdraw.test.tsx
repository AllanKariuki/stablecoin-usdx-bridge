import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Wallet } from '@damp/web-shared/api';
import type { BankAccount, PaymentIntent } from '@damp/web-shared/api/payments';
import DepositPage from '../pages/DepositPage';
import WithdrawPage from '../pages/WithdrawPage';
import { renderSignedIn } from '../test/auth';

const { ledger, walletsApi, payments } = vi.hoisted(() => ({
  ledger: { wallets: vi.fn() },
  walletsApi: { createWallet: vi.fn() },
  payments: { bankAccounts: vi.fn(), createIntent: vi.fn(), intent: vi.fn() },
}));
vi.mock('@damp/web-shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@damp/web-shared/api')>();
  return { ...actual, ledgerApi: { ...actual.ledgerApi, ...ledger }, walletsApi: { ...actual.walletsApi, ...walletsApi } };
});
vi.mock('@damp/web-shared/api/payments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@damp/web-shared/api/payments')>();
  return { ...actual, paymentsApi: { ...actual.paymentsApi, ...payments } };
});

const kes: Wallet = {
  id: 'w-kes',
  userId: 'u1',
  currency: 'KES',
  chain: '',
  address: '',
  status: 'ACTIVE',
  label: 'Shillings',
  isDefault: true,
  balance: { amount: '1000.00', currency: 'KES', decimals: 2, display: 'KSh 1,000.00' },
};
const btc: Wallet = { ...kes, id: 'w-btc', currency: 'BTC', chain: 'BITCOIN', label: 'Bitcoin', balance: { amount: '0.5', currency: 'BTC', decimals: 8, display: '0.5 BTC' } };

const bank: BankAccount = {
  id: 'ba-kes',
  bankId: 'bank_equity',
  bankName: 'Equity Bank',
  accountName: 'Test User',
  accountNumberMasked: '•••• 9876',
  currency: 'KES',
  status: 'VERIFIED',
  isDefault: true,
  verifiedAt: null,
};

const intent = (patch: Partial<PaymentIntent>): PaymentIntent => ({
  id: 'pi-1',
  direction: 'DEPOSIT',
  amount: { amount: '500.00', currency: 'KES', decimals: 2, display: 'KSh 500.00' },
  status: 'REQUIRES_ACTION',
  rail: 'mpesa',
  walletId: 'w-kes',
  bankAccountId: null,
  beneficiaryId: null,
  invoiceId: null,
  description: '',
  failureReason: '',
  ledgerTxId: null,
  customerAction: 'Check your phone to approve the M-Pesa prompt',
  createdAt: '2026-11-27T09:00:00.000Z',
  settledAt: null,
  ...patch,
});

beforeEach(() => {
  [ledger, walletsApi, payments].forEach((group) => Object.values(group).forEach((fn) => fn.mockReset()));
  ledger.wallets.mockResolvedValue([kes, btc]);
  payments.bankAccounts.mockResolvedValue([bank]);
});

describe('DepositPage', () => {
  it('M-Pesa deposit: asks for approval on the phone, then shows the credit', async () => {
    const user = userEvent.setup();
    payments.createIntent.mockResolvedValue(intent({}));
    let settle!: (i: PaymentIntent) => void;
    payments.intent.mockReturnValue(new Promise<PaymentIntent>((resolve) => (settle = resolve)));

    renderSignedIn(<DepositPage />, ['customer'], '/move/deposit');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(await screen.findByRole('radio', { name: /shillings/i }));
    await user.type(screen.getByLabelText(/amount/i), '500');
    await user.type(screen.getByLabelText(/m-pesa number/i), '254712345678');
    await user.click(screen.getByRole('button', { name: /review/i }));
    await user.click(await screen.findByRole('button', { name: /confirm deposit/i }));

    await waitFor(() => expect(payments.createIntent).toHaveBeenCalledTimes(1));
    const [body, key] = payments.createIntent.mock.calls[0];
    expect(body).toEqual({ direction: 'DEPOSIT', amount: '500', currency: 'KES', sourceWalletId: 'w-kes', phoneNumber: '254712345678' });
    expect(typeof key).toBe('string');
    expect(await screen.findByText(/approve the prompt on your phone/i)).toBeInTheDocument();

    settle(intent({ status: 'SETTLED', settledAt: '2026-11-27T09:01:00.000Z' }));
    expect(await screen.findByText(/money added/i, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('rejects a phone number that is not a Kenyan mobile', async () => {
    const user = userEvent.setup();
    renderSignedIn(<DepositPage />, ['customer'], '/move/deposit');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(await screen.findByRole('radio', { name: /shillings/i }));
    await user.type(screen.getByLabelText(/amount/i), '500');
    await user.type(screen.getByLabelText(/m-pesa number/i), '0712345678');
    await user.click(screen.getByRole('button', { name: /review/i }));
    expect(await screen.findByText(/safaricom number/i)).toBeInTheDocument();
    expect(payments.createIntent).not.toHaveBeenCalled();
  });
});

describe('WithdrawPage', () => {
  async function toAmountStep(user: ReturnType<typeof userEvent.setup>) {
    renderSignedIn(<WithdrawPage />, ['customer'], '/move/withdraw');
    await user.click(await screen.findByRole('radio', { name: /shillings/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.selectOptions(await screen.findByLabelText(/to bank account/i), 'ba-kes');
    await user.click(screen.getByRole('button', { name: /continue/i }));
  }

  it('offers only fiat wallets as a source', async () => {
    renderSignedIn(<WithdrawPage />, ['customer'], '/move/withdraw');
    expect(await screen.findByRole('radio', { name: /shillings/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /bitcoin/i })).not.toBeInTheDocument();
  });

  it('refuses an amount above the available balance', async () => {
    const user = userEvent.setup();
    await toAmountStep(user);
    await user.type(screen.getByLabelText(/amount/i), '1000.01');
    await user.click(screen.getByRole('button', { name: /review/i }));
    expect(await screen.findByText(/you have KSh 1,000.00 available/i)).toBeInTheDocument();
    expect(payments.createIntent).not.toHaveBeenCalled();
  });

  it('requires the amount to be retyped, then submits the payout', async () => {
    const user = userEvent.setup();
    payments.createIntent.mockResolvedValue(intent({ direction: 'WITHDRAWAL', rail: 'stub', status: 'PROCESSING', customerAction: null }));
    payments.intent.mockReturnValue(new Promise<PaymentIntent>(() => undefined));
    await toAmountStep(user);
    await user.type(screen.getByLabelText(/amount/i), '250');
    await user.click(screen.getByRole('button', { name: /review/i }));
    await user.click(await screen.findByRole('button', { name: /^withdraw$/i }));

    await user.type(await screen.findByLabelText(/retype amount/i), '25');
    await user.click(screen.getByRole('button', { name: /confirm withdrawal/i }));
    expect(await screen.findByText(/doesn’t match/i)).toBeInTheDocument();
    expect(payments.createIntent).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/retype amount/i));
    await user.type(screen.getByLabelText(/retype amount/i), '250.00');
    await user.click(screen.getByRole('button', { name: /confirm withdrawal/i }));
    await waitFor(() => expect(payments.createIntent).toHaveBeenCalledTimes(1));
    expect(payments.createIntent.mock.calls[0][0]).toEqual({
      direction: 'WITHDRAWAL',
      amount: '250',
      currency: 'KES',
      sourceWalletId: 'w-kes',
      bankAccountId: 'ba-kes',
    });
  });
});
