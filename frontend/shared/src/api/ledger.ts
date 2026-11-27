import { get, post, qs, withIdempotency } from './client';
import type { BridgeAccepted, DashboardView, SagaAccepted, SagaTransfer, Transaction, TransactionPage, Wallet, WalletStatement } from './types';

/** core-ledger, reached through bff. Paths match services/auth-proxy/internal/authztable. */
export const ledgerApi = {
  dashboard: () => get<DashboardView>('/dashboard'),

  wallets: () => get<Wallet[]>('/wallets'),
  wallet: (walletId: string) => get<Wallet>(`/wallets/${encodeURIComponent(walletId)}`),
  statement: (walletId: string, params: { from?: string; to?: string; limit?: number } = {}) =>
    get<WalletStatement>(`/wallets/${encodeURIComponent(walletId)}/statement${qs(params)}`),
  setWalletStatus: (walletId: string, status: 'ACTIVE' | 'FROZEN') =>
    post<Wallet>(`/wallets/${encodeURIComponent(walletId)}/status`, { status }),
  createUsdxWallet: (input: { chain: string; address?: string }) => post<Wallet>('/wallets/usdx', input),

  transactions: (params: { cursor?: string; limit?: number } = {}) => get<TransactionPage>(`/transactions${qs(params)}`),
  transaction: (id: string) => get<Transaction>(`/transactions/${encodeURIComponent(id)}`),

  deposit: (input: { walletId: string; amount: string; reference?: string }, key: string) =>
    post<Transaction>('/deposits', input, withIdempotency(key)),
  withdraw: (input: { walletId: string; amount: string; reference?: string }, key: string) =>
    post<Transaction>('/withdrawals', input, withIdempotency(key)),
  transfer: (input: { fromWalletId: string; toWalletId: string; amount: string; reference?: string }, key: string) =>
    post<Transaction>('/transfers', input, withIdempotency(key)),

  issue: (input: { fiatWalletId: string; usdxWalletId: string; amount: string }, key: string) =>
    post<SagaAccepted>('/issuances', input, withIdempotency(key)),
  redeem: (input: { usdxWalletId: string; fiatWalletId: string; amount: string }, key: string) =>
    post<SagaAccepted>('/redemptions', input, withIdempotency(key)),
  /** Moves the caller's own USD-X between their own wallets on two chains;
   * bff answers with the saga handle (the journal posts when the burn
   * confirms), which is polled through sagaTransfer. */
  bridge: (input: { fromWalletId: string; toWalletId: string; amount: string }, key: string) =>
    post<BridgeAccepted>('/bridges', input, withIdempotency(key)),
  sagaTransfer: (correlationId: string) => get<SagaTransfer>(`/transfers/${encodeURIComponent(correlationId)}`),
};
