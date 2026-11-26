import { get, patch, post } from './client';
import type { Wallet } from './types';

/** services/bff/src/wallets/wallet.types.ts CurrencyView — core-ledger's
 * supported-currency set (GET /currencies). */
export interface Currency {
  code: string;
  kind: string;
  decimals: number;
  name: string;
  nativeChain: string;
}

export const walletsApi = {
  /** The supported currencies (slice 4b), read from core-ledger's chart —
   * bff answers with a bare array. */
  currencies: () => get<Currency[]>('/currencies'),
  /** Opens a wallet in any currency. USD-X is refused (422 USE_USDX_ROUTE)
   * — use ledgerApi.createUsdxWallet, which requires a chain. */
  createWallet: (input: { currency: string; label?: string }) => post<Wallet>('/wallets', input),
  /** Patches the metadata a wallet owner may change: the default flag and
   * the label. */
  updateWallet: (walletId: string, input: { isDefault?: boolean; label?: string }) =>
    patch<Wallet>(`/wallets/${encodeURIComponent(walletId)}`, input),
};
