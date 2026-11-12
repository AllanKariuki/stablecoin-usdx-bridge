import { del, get, post, qs, withIdempotency } from './client';
import type { Money } from './money';

/** services/payments, via bff. Shapes mirror its controllers' render functions. */
export type IntentDirection = 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';

export interface PaymentIntent {
  id: string;
  direction: IntentDirection;
  amount: Money;
  status: string;
  rail: string;
  walletId: string;
  bankAccountId: string | null;
  beneficiaryId: string | null;
  invoiceId: string | null;
  description: string;
  failureReason: string;
  ledgerTxId: string | null;
  /** e.g. "Check your phone to approve the M-Pesa prompt". */
  customerAction: string | null;
  createdAt: string;
  settledAt: string | null;
}

export interface Invoice {
  id: string;
  number: string;
  amount: Money;
  status: string;
  dueDate: string | null;
  description: string;
  lineItems: unknown[];
  payerName: string;
  payerEmail: string;
  /** Only returned to the issuer. */
  payLink: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** What an unauthenticated payment link resolves to — no ids, no party data. */
export interface PublicInvoice {
  number: string;
  amount: Money;
  description: string;
  dueDate: string | null;
  lineItems: unknown[];
  payerName: string;
}

export interface Bank {
  id: string;
  name: string;
  country: string;
  currency: string;
  swiftCode: string;
  rail: string;
  logoUrl: string | null;
}

export interface BankAccount {
  id: string;
  bankId: string;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  currency: string;
  status: string;
  isDefault: boolean;
  verifiedAt: string | null;
}

export interface Beneficiary {
  id: string;
  name: string;
  kind: 'BANK' | 'WALLET' | 'MOBILE' | string;
  bankId: string | null;
  accountRef: string;
  currency: string;
  targetPartyId: string;
}

export const paymentsApi = {
  intents: async () => (await get<{ paymentIntents: PaymentIntent[] }>('/payment-intents')).paymentIntents,
  intent: (id: string) => get<PaymentIntent>(`/payment-intents/${encodeURIComponent(id)}`),
  createIntent: (
    input: { direction: IntentDirection; amount: string; currency: string; bankAccountId?: string; beneficiaryId?: string; description?: string; phoneNumber?: string },
    key: string,
  ) => post<PaymentIntent>('/payment-intents', input, withIdempotency(key)),
  cancelIntent: (id: string) => post<PaymentIntent>(`/payment-intents/${encodeURIComponent(id)}/cancel`),

  /** `issued` = invoices I sent; `payer` = invoices I owe. */
  invoices: async (role: 'issued' | 'payer' = 'issued') =>
    (await get<{ invoices: Invoice[] }>(`/invoices${qs({ role: role === 'payer' ? 'payer' : undefined })}`)).invoices,
  invoice: (id: string) => get<Invoice>(`/invoices/${encodeURIComponent(id)}`),
  createInvoice: (input: { amount: string; currency: string; payerEmail?: string; payerName?: string; dueDate?: string; description?: string }) =>
    post<Invoice>('/invoices', input),
  voidInvoice: (id: string) => post<{ id: string; status: 'VOID' }>(`/invoices/${encodeURIComponent(id)}/void`),
  payInvoice: (id: string, key: string) => post<PaymentIntent>(`/invoices/${encodeURIComponent(id)}/pay`, {}, withIdempotency(key)),

  availableBanks: () => get<Bank[]>('/banks/available'),
  bankAccounts: () => get<BankAccount[]>('/banks/user-accounts'),
  registerBankAccount: (input: { bankId: string; accountName: string; accountNumber: string; currency?: string }) =>
    post<BankAccount>('/banks/register', input),
  verifyBankAccount: (accountId: string) => post<BankAccount>('/banks/link', { accountId }),
  removeBankAccount: (accountId: string) => del<unknown>(`/banks/user-accounts/${encodeURIComponent(accountId)}`),
  beneficiaries: () => get<Beneficiary[]>('/banks/beneficiaries'),
  addBeneficiary: (input: { name: string; kind?: 'BANK' | 'WALLET' | 'MOBILE'; bankId?: string; accountRef: string; currency: string }) =>
    post<Beneficiary>('/banks/beneficiaries', input),
};

/**
 * Resolves a payment link. This route is deliberately NOT behind the
 * gateway (auth-proxy has no rule for it — the token is the credential), so
 * it goes straight to services/payments' public origin.
 */
export async function resolvePaymentLink(token: string): Promise<PublicInvoice> {
  const base =
    (typeof window !== 'undefined' && (window.RUNTIME_CONFIG as Record<string, string | undefined> | undefined)?.VITE_PAYMENTS_PUBLIC_URL) ||
    'http://localhost:3003';
  const response = await fetch(`${base.replace(/\/$/, '')}/invoices/pay/${encodeURIComponent(token)}`);
  if (response.status === 404) throw new Error('This payment link is not valid, or the invoice has already been paid or voided.');
  if (!response.ok) throw new Error('We couldn’t open this payment link. Try again in a moment.');
  return response.json();
}
