import type { SagaStatus, SagaTransfer } from '@damp/web-shared/api';
import type { Tone } from '@damp/web-shared/ui';
import { humanize } from '@damp/web-shared/lib';

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

/**
 * A bridge walks core-ledger's saga statuses PENDING → BURN_CONFIRMED →
 * MINT_SUBMITTED → COMPLETED, on top of the chain: the journal debit, the
 * source-chain burn and its finality, the target-chain mint and its
 * finality, then the journal credit into the destination wallet. The source
 * hash marks a burn in flight (core-ledger stays PENDING until it is final).
 */
function bridgeReached(t: SagaTransfer): number {
  if (t.status === 'COMPLETED') return 4;
  if (t.status === 'MINT_SUBMITTED' || t.destTxHash) return 3;
  if (t.status === 'BURN_CONFIRMED' || t.sourceTxHash) return 2;
  return 1;
}

/** The steps a saga walks through, with where it currently is. Exported for tests. */
export function sagaSteps(t: SagaTransfer): Array<{ label: string; state: StepState }> {
  const failed = t.status === 'FAILED' || t.status === 'COMPENSATED';
  const reached =
    t.kind === 'BRIDGE'
      ? bridgeReached(t)
      : t.kind === 'REDEEM'
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
    t.kind === 'BRIDGE'
      ? [
          'USD-X debited on the ledger',
          `Burned on ${humanize(t.sourceChain)}`,
          `Minted on ${humanize(t.targetChain)}`,
          `Credited to your ${humanize(t.targetChain)} wallet`,
        ]
      : t.kind === 'REDEEM'
        ? ['USD-X debited on the ledger', 'Burn submitted on chain', 'Burn final', 'Dollars released to your wallet']
        : ['Dollars reserved on the ledger', 'Mint submitted on chain', 'Final on chain'];
  return labels.map((label, i) => {
    const n = i + 1;
    if (n <= reached) return { label, state: 'done' };
    if (n === reached + 1) return { label, state: failed ? 'failed' : 'active' };
    return { label, state: 'todo' };
  });
}
