import { Money } from '../money/money';

/** camelCase translation of core-ledger's renderWallet
 * (core-ledger/internal/api/handlers.go). */
export interface WalletView {
  id: string;
  userId: string;
  currency: string;
  chain: string;
  address: string;
  status: string;
  label: string;
  balance: Money;
}

interface CoreLedgerWallet {
  id: string;
  user_id: string;
  currency: string;
  chain: string;
  address: string;
  status: string;
  label: string;
  balance: string;
}

export interface StatementEntryView {
  seq: number;
  transactionId: string;
  direction: string;
  amount: Money;
  runningBalance: Money;
  currency: string;
  valueDate: string;
  description: string;
}

interface CoreLedgerStatementEntry {
  seq: number;
  transaction_id: string;
  direction: string;
  amount: string;
  running_balance: string;
  currency: string;
  value_date: string;
  description: string;
}

export interface StatementView {
  walletId: string;
  currency: string;
  entries: StatementEntryView[];
}

interface CoreLedgerStatement {
  wallet_id: string;
  currency: string;
  entries: CoreLedgerStatementEntry[];
}

export type { CoreLedgerWallet, CoreLedgerStatement, CoreLedgerStatementEntry };
