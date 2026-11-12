import { Check, ExternalLink, Loader2, X } from 'lucide-react';
import type { SagaTransfer } from '@damp/web-shared/api';
import { STATUS_TONE, sagaLabel, sagaSteps } from '../lib/saga';
import { cx, formatDateTime } from '@damp/web-shared/lib';
import { Badge, Callout, MonoRef } from '@damp/web-shared/ui';

/**
 * Async bridge status — a progress stepper, not a spinner: issuance and
 * redemption take as long as the chain's finality (≈15 min on Sepolia).
 */
export default function SagaTimeline({ transfer }: { transfer: SagaTransfer }) {
  const redeem = transfer.kind === 'REDEEM';
  const hash = redeem ? transfer.sourceTxHash : transfer.destTxHash;
  const url = redeem ? transfer.sourceTxUrl : transfer.destTxUrl;
  const steps = sagaSteps(transfer);

  return (
    <div className="flex flex-col gap-5 rounded-card border border-line bg-canvas p-5" data-testid="saga-progress">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{redeem ? 'Redemption' : 'Issuance'}</p>
          <p className="mt-1 text-lg font-extrabold tracking-tight text-navy">{transfer.amount.display} USD-X</p>
        </div>
        <Badge tone={STATUS_TONE[transfer.status]}>{sagaLabel(transfer)}</Badge>
      </div>

      <ol className="m-0 flex list-none flex-col gap-0 p-0">
        {steps.map((s, i) => (
          <li key={s.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cx(
                  'grid size-7 shrink-0 place-items-center rounded-full border-2',
                  s.state === 'done' && 'border-action bg-action text-white',
                  s.state === 'active' && 'border-action bg-surface text-action',
                  s.state === 'failed' && 'border-danger bg-danger-tint text-danger',
                  s.state === 'todo' && 'border-line-strong bg-surface text-subtle',
                )}
              >
                {s.state === 'done' ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : s.state === 'active' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : s.state === 'failed' ? <X className="size-3.5" strokeWidth={3} aria-hidden /> : <span className="text-[11px] font-bold">{i + 1}</span>}
              </span>
              {i < steps.length - 1 && <span className={cx('w-0.5 flex-1 min-h-5', s.state === 'done' ? 'bg-action' : 'bg-line-strong')} aria-hidden />}
            </div>
            <p className={cx('pb-4 pt-1 text-sm', s.state === 'todo' ? 'text-subtle' : 'font-semibold text-ink')}>
              {s.label}
              <span className="sr-only"> — {s.state === 'done' ? 'done' : s.state === 'active' ? 'in progress' : s.state === 'failed' ? 'failed' : 'not started'}</span>
            </p>
          </li>
        ))}
      </ol>

      {hash && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-surface px-3 py-2.5">
          <span className="text-xs font-semibold text-muted">{redeem ? 'Burn' : 'Mint'} transaction</span>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all font-mono text-[12px] text-action hover:underline">
              {hash}
              <ExternalLink className="size-3 shrink-0" aria-hidden />
            </a>
          ) : (
            <span className="break-all font-mono text-[12px] text-navy">{hash}</span>
          )}
        </div>
      )}

      {!transfer.terminal && transfer.attempts > 0 && transfer.lastError && (
        <Callout tone="warn" title={`Retrying (attempt ${transfer.attempts})`}>
          {transfer.lastError}
        </Callout>
      )}
      {transfer.status === 'FAILED' && <Callout tone="danger" title="This didn’t complete">{transfer.lastError || 'The chain step failed.'}</Callout>}
      {transfer.status === 'COMPENSATED' && (
        <Callout tone="warn" title="Failed and reversed">
          The chain step failed, so the ledger entry was reversed. Your balance is back where it started.
        </Callout>
      )}

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          Reference <MonoRef value={transfer.correlationId} />
        </span>
        <span>Started {formatDateTime(transfer.createdAt)}</span>
      </p>
    </div>
  );
}
