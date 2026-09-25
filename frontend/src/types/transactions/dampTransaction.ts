import type { Money } from '../money';

/**
 * Mirrors services/bff/src/transactions/transaction.types.ts's
 * TransactionView exactly. core-ledger transactions are double-entry — each
 * has N `entries`, one per account touched — so unlike the legacy
 * `TransactionHistory` type (types/financial/paymentTypes.ts) there is no
 * single top-level amount/direction.
 */
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

export interface TransactionPage {
  transactions: Transaction[];
  nextCursor: string;
}

export interface TransactionsState {
  items: Transaction[];
  nextCursor: string | null;
  selectedTransaction: Transaction | null;
  loading: boolean;
  error: string | null;
}

/**
 * A transaction's own entries carry no "is this the leg the current viewer
 * cares about" flag — pick the entry booked against one of the caller's own
 * wallets, since that's the leg whose sign and running balance are
 * meaningful to them. Wallet accounts are named `2100.<CCY>.<walletID>`
 * (docs/building-plan.md's chart of accounts), so the match is by suffix,
 * not full equality. Falls back to the first entry (e.g. an operator
 * viewing another party's transaction) rather than hiding the row.
 */
export function primaryEntryFor(tx: Transaction, ownWalletIds: ReadonlySet<string>): TransactionEntry {
  return tx.entries.find((e) => ownWalletIds.has(e.accountId.split('.').pop() ?? '')) ?? tx.entries[0];
}
