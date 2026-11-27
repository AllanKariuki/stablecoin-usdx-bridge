import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Currency, QuotePreview, Wallet } from '@damp/web-shared/api';
import type { BankAccount, Beneficiary, PaymentIntent } from '@damp/web-shared/api/payments';
import SendMoneyPage from '../pages/SendMoneyPage';
import { renderSignedIn } from '../test/auth';

const { ledger, fx, walletsApi, payments } = vi.hoisted(() => ({
  ledger: { wallets: vi.fn() },
  fx: { quote: vi.fn() },
  walletsApi: { currencies: vi.fn() },
  payments: { beneficiaries: vi.fn(), bankAccounts: vi.fn(), createIntent: vi.fn(), intent: vi.fn() },
}));
vi.mock('@damp/web-shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@damp/web-shared/api')>();
  return {
    ...actual,
    ledgerApi: { ...actual.ledgerApi, ...ledger },
    fxApi: { ...actual.fxApi, ...fx },
    walletsApi: { ...actual.walletsApi, ...walletsApi },
  };
});
vi.mock('@damp/web-shared/api/payments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@damp/web-shared/api/payments')>();
  return { ...actual, paymentsApi: { ...actual.paymentsApi, ...payments } };
});

const wallet = (patch: Partial<Wallet>): Wallet => ({
  id: 'w-1',
  userId: 'u1',
  currency: 'USD',
  chain: '',
  address: '',
  status: 'ACTIVE',
  label: '',
  isDefault: true,
  balance: { amount: '1000.00', currency: 'USD', decimals: 2, display: '$1,000.00' },
  ...patch,
});

const usd = wallet({ id: 'w-usd', label: 'Main' });
const eur = wallet({
  id: 'w-eur',
  currency: 'EUR',
  label: 'Savings',
  isDefault: false,
  balance: { amount: '500.00', currency: 'EUR', decimals: 2, display: '€500.00' },
});
const usdx = wallet({
  id: 'w-usdx',
  currency: 'USDX',
  chain: 'ETHEREUM',
  label: 'Stack',
  isDefault: false,
  balance: { amount: '0.000000', currency: 'USDX', decimals: 6, display: '0.000000' },
});

const currencies: Currency[] = [
  { code: 'USD', kind: 'FIAT', decimals: 2, name: 'US Dollar', nativeChain: '' },
  { code: 'EUR', kind: 'FIAT', decimals: 2, name: 'Euro', nativeChain: '' },
];

const alice: Beneficiary = {
  id: 'b-alice',
  name: 'Alice Wanjiru',
  kind: 'WALLET',
  bankId: null,
  accountRef: 'alice@damp.local',
  currency: 'USD',
  targetPartyId: 'p-alice',
};

const bankAccount: BankAccount = {
  id: 'ba-1',
  bankId: 'bank-1',
  bankName: 'NCBA Bank',
  accountName: 'Alice Wanjiru',
  accountNumberMasked: '•••• 1234',
  currency: 'USD',
  status: 'VERIFIED',
  isDefault: true,
  verifiedAt: null,
};

const intent = (patch: Partial<PaymentIntent>): PaymentIntent => ({
  id: 'pi-1',
  direction: 'TRANSFER',
  amount: { amount: '100.00', currency: 'USD', decimals: 2, display: '$100.00' },
  status: 'SETTLED',
  rail: 'INTERNAL',
  walletId: 'w-alice',
  bankAccountId: null,
  beneficiaryId: 'b-alice',
  invoiceId: null,
  description: '',
  failureReason: '',
  ledgerTxId: null,
  customerAction: null,
  createdAt: '2026-11-27T09:00:00.000Z',
  settledAt: '2026-11-27T09:01:00.000Z',
  ...patch,
});

/** A TO-side quote pinning the source amount so Alice nets exactly 100 USD. */
const toQuote = (): QuotePreview => ({
  quoteId: 'q-to-1',
  route: 'FX',
  from: 'EUR',
  to: 'USD',
  amount: '108.00',
  rate: '0.9259259',
  fee: '1.00',
  net: '100.00',
  expiresAt: null,
  amountSide: 'TO',
  spreadBps: 25,
});

describe('SendMoneyPage', () => {
  beforeEach(() => {
    Object.values(ledger).forEach((fn) => fn.mockReset());
    Object.values(fx).forEach((fn) => fn.mockReset());
    Object.values(walletsApi).forEach((fn) => fn.mockReset());
    Object.values(payments).forEach((fn) => fn.mockReset());
    walletsApi.currencies.mockResolvedValue(currencies);
    ledger.wallets.mockResolvedValue([usd]);
    payments.beneficiaries.mockResolvedValue([]);
    payments.bankAccounts.mockResolvedValue([]);
    payments.createIntent.mockResolvedValue(intent({}));
    payments.intent.mockResolvedValue(intent({}));
    sessionStorage.clear();
  });

  it('same-currency payment creates an intent with the source wallet and no quote legs', async () => {
    ledger.wallets.mockResolvedValue([usd]);
    payments.beneficiaries.mockResolvedValue([alice]);

    renderSignedIn(<SendMoneyPage />, ['customer'], '/send');

    await userEvent.click(await screen.findByRole('button', { name: /Alice/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '100' } });
    await userEvent.click(await screen.findByRole('radio', { name: /Main/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send now' }));

    await waitFor(() => expect(payments.createIntent).toHaveBeenCalledTimes(1));
    expect(payments.createIntent.mock.calls[0][0]).toEqual({
      direction: 'TRANSFER',
      amount: '100',
      currency: 'USD',
      beneficiaryId: 'b-alice',
      sourceWalletId: 'w-usd',
    });
    expect(fx.quote).not.toHaveBeenCalled();
  });

  it('cross-currency requests a TO-side quote and sends quoteId + sourceAmount', async () => {
    ledger.wallets.mockResolvedValue([usd, eur]);
    payments.beneficiaries.mockResolvedValue([alice]);
    fx.quote.mockResolvedValue(toQuote());

    renderSignedIn(<SendMoneyPage />, ['customer'], '/send');

    await userEvent.click(await screen.findByRole('button', { name: /Alice/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '100' } });
    await userEvent.click(await screen.findByRole('radio', { name: /Savings/ }));

    // The TO-side quote debounces in, then the review unlocks.
    await waitFor(
      () => expect(fx.quote).toHaveBeenCalledWith({ fromWalletId: 'w-eur', toCurrency: 'USD', amount: '100', amountSide: 'TO' }),
      { timeout: 3000 },
    );
    await waitFor(() => expect(screen.getByText('100.00 USD')).toBeInTheDocument(), { timeout: 3000 });

    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send now' }));

    await waitFor(() => expect(payments.createIntent).toHaveBeenCalledTimes(1));
    expect(payments.createIntent.mock.calls[0][0]).toEqual({
      direction: 'TRANSFER',
      amount: '100',
      currency: 'USD',
      beneficiaryId: 'b-alice',
      sourceWalletId: 'w-eur',
      quoteId: 'q-to-1',
      sourceAmount: '108.00',
    });
  });

  it('bank recipient disables other-currency wallets and shows a Convert-first link', async () => {
    ledger.wallets.mockResolvedValue([usd, eur]);
    payments.bankAccounts.mockResolvedValue([bankAccount]);

    renderSignedIn(<SendMoneyPage />, ['customer'], '/send');

    await userEvent.click(await screen.findByRole('tab', { name: 'Bank account' }));
    await userEvent.click(await screen.findByRole('button', { name: /NCBA Bank/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const eurWallet = await screen.findByRole('radio', { name: /Savings/ });
    expect(eurWallet).toBeDisabled();
    expect(screen.getByRole('link', { name: 'open Convert' })).toHaveAttribute('href', '/convert?to=USD');
  });

  it('a CONVERTING result renders the tracker and reaches the success state when the poll settles', async () => {
    ledger.wallets.mockResolvedValue([usd, usdx]);
    payments.beneficiaries.mockResolvedValue([alice]);
    payments.createIntent.mockResolvedValue(intent({ status: 'CONVERTING', sourceWalletId: 'w-usdx', sourceCurrency: 'USDX' }));

    // The poll is held open so the CONVERTING state is observable, then settled.
    let resolvePoll!: (value: PaymentIntent) => void;
    const poll = new Promise<PaymentIntent>((resolve) => {
      resolvePoll = resolve;
    });
    payments.intent.mockReturnValue(poll);

    renderSignedIn(<SendMoneyPage />, ['customer'], '/send');

    await userEvent.click(await screen.findByRole('button', { name: /Alice/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '100' } });
    await userEvent.click(await screen.findByRole('radio', { name: 'USD-X' }));
    await userEvent.click(await screen.findByRole('radio', { name: /Stack/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send now' }));

    // USD-X → USD books as CONVERTING: the tracker is up and polling.
    expect(await screen.findByTestId('converting-tracker')).toBeInTheDocument();
    expect(screen.getByText('USD-X is settling')).toBeInTheDocument();
    expect(payments.intent).toHaveBeenCalledWith('pi-1');

    // The first poll lands SETTLED — the tracker walks to the receipt.
    await act(async () => {
      resolvePoll(intent({ id: 'pi-1', status: 'SETTLED' }));
    });
    expect(screen.getByText('Payment sent')).toBeInTheDocument();
  });
});
