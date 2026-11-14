import type { SagaStatus, SagaTransfer } from '@damp/web-shared/api';
import type { Tone } from '@damp/web-shared/ui';

export const STATUS_LABELS: Record<SagaStatus, string> = {
  PENDING: 'Queued for the chain',
  BURN_CONFIRMED: 'Burn confirmed',
  MINT_SUBMITTED: 'Mint submitted, waiting for finality',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  COMPENSATED: 'Failed and reversed',
};

export const STATUS_TONE: Record<SagaStatus, Tone> = {
  PENDING: 'info',
  BURN_CONFIRMED: 'info',
  MINT_SUBMITTED: 'info',
  COMPLETED: 'cyan',
  FAILED: 'danger',
  COMPENSATED: 'warn',
};

export type StepState = 'done' | 'active' | 'todo' | 'failed';

/**
 * core-ledger keeps a redemption in PENDING until its burn is final, so a
 * burn "in flight" is read from the presence of a source hash.
 */
export function sagaLabel(t: SagaTransfer): string {
  const burnInFlight = t.kind === 'REDEEM' && t.status === 'PENDING' && t.sourceTxHash !== '';
  return burnInFlight ? 'Burn submitted, waiting for finality' : STATUS_LABELS[t.status];
}

/** The steps a saga walks through, with where it currently is. Exported for tests. */
export function sagaSteps(t: SagaTransfer): Array<{ label: string; state: StepState }> {
  const failed = t.status === 'FAILED' || t.status === 'COMPENSATED';
  const reached =
    t.kind === 'REDEEM'
      ? t.status === 'COMPLETED'
        ? 4
        : t.status === 'BURN_CONFIRMED'
          ? 3
          : t.sourceTxHash
            ? 2
            : 1
      : t.status === 'COMPLETED'
        ? 3
        : t.status === 'MINT_SUBMITTED' || t.destTxHash
          ? 2
          : 1;
  const labels =
    t.kind === 'REDEEM'
      ? ['USD-X debited on the ledger', 'Burn submitted on chain', 'Burn final', 'Dollars released to your wallet']
      : ['Dollars reserved on the ledger', 'Mint submitted on chain', 'Final on chain'];
  return labels.map((label, i) => {
    const n = i + 1;
    if (n <= reached) return { label, state: 'done' };
    if (n === reached + 1) return { label, state: failed ? 'failed' : 'active' };
    return { label, state: 'todo' };
  });
}
