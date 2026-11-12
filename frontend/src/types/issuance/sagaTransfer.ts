import type { Money } from '../money';
import type { Transaction } from '../transactions/dampTransaction';

/**
 * Mirrors services/bff/src/issuance/issuance.types.ts exactly. The saga is
 * core-ledger's BridgeTransfer: the journal entry lands synchronously, the
 * on-chain mint/burn runs in core-ledger's worker and is polled here.
 */
export type SagaStatus = 'PENDING' | 'BURN_CONFIRMED' | 'MINT_SUBMITTED' | 'COMPLETED' | 'FAILED' | 'COMPENSATED';

export interface SagaAccepted {
  transaction: Transaction;
  correlationId: string;
  sagaStatus: SagaStatus;
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
  /** Built by bff from the deployment's explorer config; null until there is a hash. */
  sourceTxUrl: string | null;
  destTxUrl: string | null;
  attempts: number;
  nextAttemptAt: string;
  lastError: string;
  ledgerTxId: string;
  createdAt: string;
  updatedAt: string;
}

export interface IssuanceState {
  transfersById: Record<string, SagaTransfer>;
  activeCorrelationId: string | null;
  submitting: boolean;
  error: string | null;
}
