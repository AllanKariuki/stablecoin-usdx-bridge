import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { QuotePreview, Wallet } from '@damp/web-shared/api';
import type { Invoice, PaymentIntent, PublicInvoice } from '@damp/web-shared/api/payments';
import InvoicesTab from '../pages/payments/InvoicesTab';
import PayInvoicePage from '../pages/PayInvoicePage';
import { renderSignedIn } from '../test/auth';

const { ledger, fx, payments, resolvePaymentLink } = vi.hoisted(() => ({
  ledger: { wallets: vi.fn() },
  fx: { quote: vi.fn() },
  payments: { invoices: vi.fn(), payInvoice: vi.fn(), intent: vi.fn() },
  resolvePaymentLink: vi.fn(),
}));
vi.mock('@damp/web-shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@damp/web-shared/api')>();
  return {
    ...actual,
    ledgerApi: { ...actual.ledgerApi, ...ledger },
    fxApi: { ...actual.fxApi, ...fx },
  };
});
vi.mock('@damp/web-shared/api/payments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@damp/web-shared/api/payments')>();
  return { ...actual, paymentsApi: { ...actual.paymentsApi, ...payments }, resolvePaymentLink };
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

const publicInvoice = (patch: Partial<PublicInvoice>): PublicInvoice => ({
  number: 'INV-0001',
  amount: { amount: '100.00', currency: 'USD', decimals: 2, display: '$100.00' },
  description: 'Consulting',
  dueDate: null,
  lineItems: [],
  payerName: '',
  ...patch,
});

const invoice = (patch: Partial<Invoice>): Invoice => ({
  id: 'inv-1',
  number: 'INV-0001',
  amount: { amount: '100.00', currency: 'USD', decimals: 2, display: '$100.00' },
  status: 'OPEN',
  dueDate: null,
  description: 'Consulting',
  lineItems: [],
  payerName: '',
  payerEmail: '',
  payLink: null,
  paidAt: null,
  createdAt: '2026-11-27T09:00:00.000Z',
  ...patch,
});

const intent = (patch: Partial<PaymentIntent>): PaymentIntent => ({
  id: 'pi-1',
  direction: 'TRANSFER',
  amount: { amount: '100.00', currency: 'USD', decimals: 2, display: '$100.00' },
  status: 'SETTLED',
  rail: 'INTERNAL',
  walletId: 'w-usd',
  bankAccountId: null,
  beneficiaryId: null,
  invoiceId: 'inv-1',
  description: 'Invoice INV-0001',
  failureReason: '',
  ledgerTxId: null,
  customerAction: null,
  createdAt: '2026-11-27T09:00:00.000Z',
  settledAt: '2026-11-27T09:01:00.000Z',
  ...patch,
});

/** A TO-side quote pinning the source amount so the issuer nets exactly 100 USD. */
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

const renderPayInvoice = () =>
  renderSignedIn(
    <Routes>
      <Route path="/pay/:payToken" element={<PayInvoicePage />} />
    </Routes>,
    ['customer'],
    '/pay/tok',
  );

describe('invoice pay', () => {
  beforeEach(() => {
    Object.values(ledger).forEach((fn) => fn.mockReset());
    Object.values(fx).forEach((fn) => fn.mockReset());
    Object.values(payments).forEach((fn) => fn.mockReset());
    resolvePaymentLink.mockReset();
    resolvePaymentLink.mockResolvedValue(publicInvoice({}));
    payments.invoices.mockResolvedValue([invoice({})]);
    payments.payInvoice.mockResolvedValue(intent({}));
    payments.intent.mockResolvedValue(intent({}));
    ledger.wallets.mockResolvedValue([usd]);
    sessionStorage.clear();
  });

  it('same-currency payment pays with sourceWalletId only', async () => {
    renderPayInvoice();

    await userEvent.click(await screen.findByRole('radio', { name: /Main/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Pay/ }));

    await waitFor(() => expect(payments.payInvoice).toHaveBeenCalledTimes(1));
    expect(payments.payInvoice.mock.calls[0][0]).toBe('inv-1');
    expect(payments.payInvoice.mock.calls[0][2]).toEqual({ sourceWalletId: 'w-usd' });
    expect(fx.quote).not.toHaveBeenCalled();
  });

  it('cross-currency requests a TO-side quote for the invoice amount and submits quoteId + sourceAmount', async () => {
    ledger.wallets.mockResolvedValue([usd, eur]);
    fx.quote.mockResolvedValue(toQuote());

    renderPayInvoice();

    await userEvent.click(await screen.findByRole('radio', { name: /Savings/ }));

    await waitFor(
      () => expect(fx.quote).toHaveBeenCalledWith({ fromWalletId: 'w-eur', toCurrency: 'USD', amount: '100.00', amountSide: 'TO' }),
      { timeout: 3000 },
    );
    await waitFor(() => expect(screen.getByText('100.00 USD')).toBeInTheDocument(), { timeout: 3000 });
    await waitFor(() => expect(screen.getByRole('button', { name: /Pay/ })).toBeEnabled(), { timeout: 3000 });

    await userEvent.click(screen.getByRole('button', { name: /Pay/ }));

    await waitFor(() => expect(payments.payInvoice).toHaveBeenCalledTimes(1));
    expect(payments.payInvoice.mock.calls[0][0]).toBe('inv-1');
    expect(payments.payInvoice.mock.calls[0][2]).toEqual({ sourceWalletId: 'w-eur', quoteId: 'q-to-1', sourceAmount: '108.00' });
  });

  it('a USD-X source into USD pays without a quote and tracks the CONVERTING intent to settlement', async () => {
    ledger.wallets.mockResolvedValue([usd, usdx]);
    payments.payInvoice.mockResolvedValue(intent({ status: 'CONVERTING', sourceWalletId: 'w-usdx', sourceCurrency: 'USDX' }));
    payments.intent.mockResolvedValue(intent({ status: 'SETTLED' }));

    renderPayInvoice();

    await userEvent.click(await screen.findByRole('radio', { name: 'USD-X' }));
    await userEvent.click(await screen.findByRole('radio', { name: /Stack/ }));

    // The 1:1 redemption needs no quote, and the note says it settles after the burn.
    expect(screen.getByText(/burn confirms/)).toBeInTheDocument();
    expect(fx.quote).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByRole('button', { name: /Pay/ }));

    await waitFor(() => expect(payments.payInvoice).toHaveBeenCalledTimes(1));
    expect(payments.payInvoice.mock.calls[0][2]).toEqual({ sourceWalletId: 'w-usdx' });

    // The tracker polls the CONVERTING intent and reaches the receipt on SETTLED.
    expect(await screen.findByText('Payment sent')).toBeInTheDocument();
  });

  it('in-app invoice pay (InvoicesTab) requests a TO-side quote and submits quoteId + sourceAmount', async () => {
    payments.invoices.mockImplementation(async (role: string) => (role === 'payer' ? [invoice({})] : []));
    ledger.wallets.mockResolvedValue([usd, eur]);
    fx.quote.mockResolvedValue(toQuote());

    renderSignedIn(<InvoicesTab />, ['customer'], '/payments');

    await userEvent.click(await screen.findByRole('tab', { name: 'To pay' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pay' }));

    await userEvent.click(await screen.findByRole('radio', { name: /Savings/ }));
    await waitFor(
      () => expect(fx.quote).toHaveBeenCalledWith({ fromWalletId: 'w-eur', toCurrency: 'USD', amount: '100.00', amountSide: 'TO' }),
      { timeout: 3000 },
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /Pay \$100\.00/ })).toBeEnabled(), { timeout: 3000 });

    await userEvent.click(screen.getByRole('button', { name: /Pay \$100\.00/ }));

    await waitFor(() => expect(payments.payInvoice).toHaveBeenCalledTimes(1));
    expect(payments.payInvoice.mock.calls[0][0]).toBe('inv-1');
    expect(payments.payInvoice.mock.calls[0][2]).toEqual({ sourceWalletId: 'w-eur', quoteId: 'q-to-1', sourceAmount: '108.00' });
  });
});
