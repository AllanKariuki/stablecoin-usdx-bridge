import { Money, toMoney } from '../money/money';
import { CoreLedgerTransaction, toTransactionView, TransactionView } from '../transactions/transaction.types';

/** The saga states core-ledger's BridgeTransfer moves through
 * (core-ledger/internal/ledger/models.go's TransferStatus). */
export type SagaStatus = 'PENDING' | 'BURN_CONFIRMED' | 'MINT_SUBMITTED' | 'COMPLETED' | 'FAILED' | 'COMPENSATED';

export const TERMINAL_SAGA_STATUSES: readonly SagaStatus[] = ['COMPLETED', 'FAILED', 'COMPENSATED'];

/** What POST /issuances and POST /redemptions answer with: the journal entry
 * that landed synchronously, plus the handle to poll for the on-chain half. */
export interface SagaAcceptedView {
  transaction: TransactionView;
  correlationId: string;
  sagaStatus: SagaStatus;
}

export interface CoreLedgerSagaAccepted extends CoreLedgerTransaction {
  correlation_id: string;
  saga_status: SagaStatus;
}

export function toSagaAcceptedView(raw: CoreLedgerSagaAccepted): SagaAcceptedView {
  return {
    transaction: toTransactionView(raw),
    correlationId: raw.correlation_id,
    sagaStatus: raw.saga_status,
  };
}

/** camelCase translation of core-ledger's renderTransfer, plus the explorer
 * links — built here rather than in the browser so which network a hash
 * belongs to is decided by the deployment that submitted it, not guessed by
 * a frontend that could be pointed at either. */
export interface TransferView {
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

export interface CoreLedgerTransfer {
  correlation_id: string;
  kind: 'MINT' | 'BRIDGE' | 'REDEEM';
  user_id: string;
  source_address: string;
  target_address: string;
  amount: string;
  source_chain: string;
  target_chain: string;
  status: SagaStatus;
  source_tx_hash: string;
  dest_tx_hash: string;
  source_wallet_id: string;
  target_wallet_id: string;
  ledger_tx_id: string;
  attempts: number;
  next_attempt_at: string;
  last_error: string;
  created_at: string;
  updated_at: string;
}

/** Explorer URL templates keyed by core-ledger's chain name; `{hash}` is
 * replaced with the transaction hash. */
export type ExplorerTemplates = Record<string, string>;

export function toTransferView(t: CoreLedgerTransfer, explorers: ExplorerTemplates): TransferView {
  return {
    correlationId: t.correlation_id,
    kind: t.kind,
    status: t.status,
    terminal: TERMINAL_SAGA_STATUSES.includes(t.status),
    amount: toMoney(t.amount, 'USDX'),
    sourceChain: t.source_chain,
    targetChain: t.target_chain,
    sourceAddress: t.source_address,
    targetAddress: t.target_address,
    sourceTxHash: t.source_tx_hash,
    destTxHash: t.dest_tx_hash,
    sourceTxUrl: explorerUrl(explorers, t.source_chain, t.source_tx_hash),
    destTxUrl: explorerUrl(explorers, t.target_chain, t.dest_tx_hash),
    attempts: t.attempts,
    nextAttemptAt: t.next_attempt_at,
    lastError: t.last_error,
    ledgerTxId: t.ledger_tx_id,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

function explorerUrl(explorers: ExplorerTemplates, chain: string, hash: string): string | null {
  const template = explorers[chain];
  if (!hash || !template) return null;
  return template.replace('{hash}', encodeURIComponent(hash));
}
