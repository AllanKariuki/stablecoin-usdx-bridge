import type { Money } from './money';

/** services/bff/src/wallets/wallet.types.ts WalletView. */
export interface Wallet {
  id: string;
  userId: string;
  currency: string;
  chain: string;
  address: string;
  status: string;
  label: string;
  /** The default wallet for its currency (meaningful where more than one
   * can exist — the USD-X chains). Optional: bff always renders it, but
   * older fixtures don't. */
  isDefault?: boolean;
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

/** services/bff/src/transactions/transaction.types.ts TransactionView. */
export interface TransactionEntry {
  lineNo: number;
  accountId: string;
  direction: string;
  currency: string;
  amount: Money;
  runningBalance: Money;
  description: string;
}

export interface Transaction {
  id: string;
  type: string;
  status: string;
  reversed: boolean;
  valueDate: string;
  description: string;
  externalRef: string;
  createdAt: string;
  entries: TransactionEntry[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface TransactionPage {
  transactions: Transaction[];
  nextCursor: string;
}

/**
 * A transaction's entries carry no "this is your leg" flag: pick the one
 * booked against one of the viewer's wallets (accounts are
 * `2100.<CCY>.<walletID>`), falling back to the first entry.
 */
export function primaryEntryFor(tx: Transaction, ownWalletIds: ReadonlySet<string>): TransactionEntry | undefined {
  return tx.entries.find((e) => ownWalletIds.has(e.accountId.split('.').pop() ?? '')) ?? tx.entries[0];
}

/** services/bff/src/issuance/issuance.types.ts. */
export type SagaStatus = 'PENDING' | 'BURN_CONFIRMED' | 'MINT_SUBMITTED' | 'COMPLETED' | 'FAILED' | 'COMPENSATED';

export interface SagaAccepted {
  transaction: Transaction;
  correlationId: string;
  sagaStatus: SagaStatus;
}

/** services/bff/src/issuance/issuance.types.ts BridgeAcceptedView — the saga
 * handle a bridge starts with. Deliberately not SagaAccepted: a bridge's
 * journal entry posts when the burn confirms, so there is no synchronous
 * transaction to return. */
export interface BridgeAccepted {
  correlationId: string;
  kind: string;
  sagaStatus: SagaStatus;
  amount: Money;
}

export interface SagaTransfer {
  correlationId: string;
  kind: 'MINT' | 'BRIDGE' | 'REDEEM';
  status: SagaStatus;
  terminal: boolean;
  amount: Money;
  sourceChain: string;
  targetChain: string;
  sourceAddress: string;
  targetAddress: string;
  sourceTxHash: string;
  destTxHash: string;
  sourceTxUrl: string | null;
  destTxUrl: string | null;
  attempts: number;
  nextAttemptAt: string;
  lastError: string;
  ledgerTxId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardView {
  wallets: Wallet[];
  recentTransactions: Transaction[];
}
