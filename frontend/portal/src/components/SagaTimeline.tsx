import { Check, ExternalLink, X } from 'lucide-react';
import type { SagaTransfer } from '@damp/web-shared/api';
import { STATUS_TONE, sagaLabel, sagaSteps } from '../lib/saga';
import { cx, formatDateTime } from '@damp/web-shared/lib';
import { Badge, Callout, MonoRef, PulseDot } from '@damp/web-shared/ui';

/**
 * Async bridge status — a progress stepper, not a spinner: issuance and
 * redemption take as long as the chain's finality (≈15 min on Sepolia).
 */
export default function SagaTimeline({ transfer }: { transfer: SagaTransfer }) {
  const redeem = transfer.kind === 'REDEEM';
  const hash = redeem ? transfer.sourceTxHash : transfer.destTxHash;
  const url = redeem ? transfer.sourceTxUrl : transfer.destTxUrl;
  const steps = sagaSteps(transfer);
  const doneCount = steps.filter((s) => s.state === 'done').length;
  const hasActive = steps.some((s) => s.state === 'active');
  const failed = steps.some((s) => s.state === 'failed');
  const fillPct = Math.round((doneCount / Math.max(steps.length, 1)) * 100);

  return (
    <div className="flex flex-col gap-5 rounded-card border border-line bg-canvas p-5" data-testid="saga-progress">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{transfer.kind === 'BRIDGE' ? 'Bridge' : redeem ? 'Redemption' : 'Issuance'}</p>
          <p className="mt-1 text-lg font-extrabold tracking-tight text-navy">{transfer.amount.display} USD-X</p>
        </div>
        <Badge tone={STATUS_TONE[transfer.status]}>{sagaLabel(transfer)}</Badge>
      </div>

      <div aria-hidden className="relative mb-5 h-1 rounded-full bg-line">
        <div className={cx('absolute inset-y-0 left-0 rounded-full transition-[width] duration-500', failed ? 'bg-danger' : 'bg-action')} style={{ width: `${fillPct}%` }} />
        {hasActive && <span className="absolute -top-[5px] size-3.5 animate-travel rounded-full bg-cyan shadow-[0_0_0_5px_rgba(31,211,230,0.22)]" style={{ marginLeft: '-7px' }} />}
      </div>

      <ol className="m-0 flex list-none flex-col gap-3 p-0 sm:flex-row">
        {steps.map((s, i) => (
          <li
            key={s.label}
            aria-current={s.state === 'active' ? 'step' : undefined}
            className={cx(
              'flex flex-1 flex-col gap-2 rounded-[16px] border p-3.5 transition-colors',
              s.state === 'done' && 'border-cyan/40 bg-cyan-tint',
              s.state === 'active' && 'border-action bg-action-tint',
              s.state === 'failed' && 'border-danger-line bg-danger-tint',
              s.state === 'todo' && 'border-line bg-surface',
            )}
          >
            <span className="flex items-center justify-between">
              <span
                className={cx(
                  'grid size-8 shrink-0 place-items-center rounded-full',
                  s.state === 'done' && 'bg-cyan-tint text-cyan-ink ring-1 ring-cyan/40',
                  s.state === 'active' && 'bg-surface text-action ring-2 ring-action',
                  s.state === 'failed' && 'bg-danger-tint text-danger ring-2 ring-danger',
                  s.state === 'todo' && 'bg-neutral-tint text-neutral-ink',
                )}
              >
                {s.state === 'done' ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : s.state === 'active' ? <PulseDot tone="cyan" /> : s.state === 'failed' ? <X className="size-3.5" strokeWidth={3} aria-hidden /> : <span className="text-[11px] font-bold">{i + 1}</span>}
              </span>
              <span className="font-mono text-[11px] text-subtle">{String(i + 1).padStart(2, '0')}</span>
            </span>
            <p className={cx('text-[13px] leading-snug', s.state === 'todo' ? 'text-subtle' : 'font-semibold text-ink')}>
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
