import { Money, toMoney } from '../money/money';

/** camelCase translation of core-ledger's renderTransaction
 * (core-ledger/internal/api/handlers.go). */
export interface TransactionEntryView {
  lineNo: number;
  accountId: string;
  direction: string;
  currency: string;
  amount: Money;
  runningBalance: Money;
  description: string;
}

export interface TransactionView {
  id: string;
  type: string;
  status: string;
  reversed: boolean;
  valueDate: string;
  description: string;
  externalRef: string;
  createdAt: string;
  entries: TransactionEntryView[];
}

interface CoreLedgerTransactionEntry {
  line_no: number;
  account_id: string;
  direction: string;
  currency: string;
  amount: string;
  running_balance: string;
  description: string;
}

export interface CoreLedgerTransaction {
  id: string;
  type: string;
  status: string;
  reversed: boolean;
  value_date: string;
  description: string;
  external_ref: string;
  created_at: string;
  entries: CoreLedgerTransactionEntry[];
}

export function toTransactionView(tx: CoreLedgerTransaction): TransactionView {
  return {
    id: tx.id,
    type: tx.type,
    status: tx.status,
    reversed: tx.reversed,
    valueDate: tx.value_date,
    description: tx.description,
    externalRef: tx.external_ref,
    createdAt: tx.created_at,
    entries: tx.entries.map((e) => ({
      lineNo: e.line_no,
      accountId: e.account_id,
      direction: e.direction,
      currency: e.currency,
      amount: toMoney(e.amount, e.currency),
      runningBalance: toMoney(e.running_balance, e.currency),
      description: e.description,
    })),
  };
}
