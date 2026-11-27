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

/** The booked FX numbers an FX_CONVERSION/FX_PAYMENT carries in metadata.
 * Only these two fields are surfaced — the rest of metadata is internal. */
export interface TransactionFxView {
  rate: string;
  spreadBps: number;
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
  fx?: TransactionFxView;
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
  metadata?: Record<string, unknown>;
  entries: CoreLedgerTransactionEntry[];
}

/** fxFromMetadata copies exactly the two customer-safe FX numbers out of
 * metadata. Metadata also holds internal identifiers (payee_user_id), so it
 * is never forwarded wholesale. */
function fxFromMetadata(metadata?: Record<string, unknown>): TransactionFxView | undefined {
  const rate = metadata?.rate;
  const spreadBps = metadata?.spread_bps;
  if (typeof rate !== 'string' || typeof spreadBps !== 'number') return undefined;
  return { rate, spreadBps };
}

export function toTransactionView(tx: CoreLedgerTransaction): TransactionView {
  const fx = fxFromMetadata(tx.metadata);
  return {
    id: tx.id,
    type: tx.type,
    status: tx.status,
    reversed: tx.reversed,
    valueDate: tx.value_date,
    description: tx.description,
    externalRef: tx.external_ref,
    createdAt: tx.created_at,
    ...(fx ? { fx } : {}),
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
