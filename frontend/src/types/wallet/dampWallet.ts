import type { Money } from '../money';

/**
 * Mirrors services/bff/src/wallets/wallet.types.ts's WalletView exactly.
 * Deliberately separate from ./wallet.ts's `Wallet` — that type models a
 * multi-asset custody product (hot/warm/cold, sweeps, per-chain balances)
 * this platform doesn't build; DAMP wallets are one fiat/USDX balance per
 * (user, currency, chain).
 */
export interface DampWallet {
  id: string;
  userId: string;
  currency: string;
  chain: string;
  address: string;
  status: string;
  label: string;
  balance: Money;
}

export interface StatementEntry {
  seq: number;
  transactionId: string;
  direction: string;
  amount: Money;
  runningBalance: Money;
  currency: string;
  valueDate: string;
  description: string;
}

export interface WalletStatement {
  walletId: string;
  currency: string;
  entries: StatementEntry[];
}

export interface WalletState {
  wallets: DampWallet[];
  selectedWalletId: string | null;
  statementsByWalletId: Record<string, WalletStatement>;
  loading: boolean;
  error: string | null;
  moneyMovement: {
    submitting: boolean;
    error: string | null;
  };
}
