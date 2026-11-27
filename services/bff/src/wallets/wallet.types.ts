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
  isDefault: boolean;
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
  is_default: boolean;
  balance: string;
}

/** camelCase translation of core-ledger's GET /currencies response
 * (core-ledger/internal/api/handlers.go's listCurrencies). */
export interface CurrencyView {
  code: string;
  kind: string;
  decimals: number;
  name: string;
  nativeChain: string;
}

interface CoreLedgerCurrency {
  code: string;
  kind: string;
  decimals: number;
  name: string;
  native_chain: string;
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

export type { CoreLedgerWallet, CoreLedgerStatement, CoreLedgerStatementEntry, CoreLedgerCurrency };
