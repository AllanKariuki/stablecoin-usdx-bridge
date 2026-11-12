import type { ReactNode } from 'react';
import { AlertTriangle, Check, Clock, Snowflake, X, CircleDot } from 'lucide-react';
import { cx } from '../lib/cx';
import { humanize } from '../lib/format';

export type Tone = 'info' | 'cyan' | 'neutral' | 'navy' | 'warn' | 'danger' | 'outline';

const TONES: Record<Tone, string> = {
  info: 'bg-action-tint text-action-ink',
  cyan: 'bg-cyan-tint text-cyan-ink',
  neutral: 'bg-neutral-tint text-neutral-ink',
  navy: 'bg-navy text-white',
  warn: 'bg-warn-tint text-warn-ink',
  danger: 'bg-danger-tint text-danger-ink',
  outline: 'bg-surface text-navy border border-dashed border-[#8c9bb5]',
};

export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap', TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

/**
 * Status → tone + icon, so state never relies on colour alone. Covers the
 * enums the platform returns (wallet, saga, transaction, KYC, approval,
 * compliance, reconciliation); anything unknown renders neutral.
 */
const STATUS: Record<string, { tone: Tone; icon: 'ok' | 'wait' | 'warn' | 'fail' | 'frozen' | 'dot' }> = {
  ACTIVE: { tone: 'cyan', icon: 'ok' },
  COMPLETED: { tone: 'cyan', icon: 'ok' },
  POSTED: { tone: 'cyan', icon: 'ok' },
  APPROVED: { tone: 'cyan', icon: 'ok' },
  VERIFIED: { tone: 'cyan', icon: 'ok' },
  PAID: { tone: 'cyan', icon: 'ok' },
  SUCCEEDED: { tone: 'cyan', icon: 'ok' },
  MATCHED: { tone: 'cyan', icon: 'ok' },
  PASS: { tone: 'cyan', icon: 'ok' },
  HEALTHY: { tone: 'cyan', icon: 'ok' },
  RESOLVED: { tone: 'cyan', icon: 'ok' },
  CLOSED: { tone: 'neutral', icon: 'ok' },
  PUBLISHED: { tone: 'cyan', icon: 'ok' },
  PENDING: { tone: 'info', icon: 'wait' },
  SUBMITTED: { tone: 'info', icon: 'wait' },
  IN_REVIEW: { tone: 'info', icon: 'wait' },
  UNDER_REVIEW: { tone: 'info', icon: 'wait' },
  PROCESSING: { tone: 'info', icon: 'wait' },
  MINT_SUBMITTED: { tone: 'info', icon: 'wait' },
  BURN_CONFIRMED: { tone: 'info', icon: 'wait' },
  OPEN: { tone: 'info', icon: 'dot' },
  DRAFT: { tone: 'neutral', icon: 'dot' },
  RUNNING: { tone: 'info', icon: 'wait' },
  INVESTIGATING: { tone: 'info', icon: 'wait' },
  SCREENING: { tone: 'info', icon: 'wait' },
  PENDING_REVIEW: { tone: 'info', icon: 'wait' },
  PENDING_APPROVAL: { tone: 'info', icon: 'wait' },
  CLOSED_CLEARED: { tone: 'neutral', icon: 'ok' },
  CLOSED_SAR: { tone: 'warn', icon: 'warn' },
  FROZEN: { tone: 'warn', icon: 'frozen' },
  ESCALATED: { tone: 'warn', icon: 'warn' },
  NEEDS_INFO: { tone: 'warn', icon: 'warn' },
  REQUIRES_ACTION: { tone: 'warn', icon: 'warn' },
  HIGH: { tone: 'warn', icon: 'warn' },
  BREAK: { tone: 'warn', icon: 'warn' },
  DRIFT: { tone: 'warn', icon: 'warn' },
  COMPENSATED: { tone: 'warn', icon: 'warn' },
  REVERSED: { tone: 'warn', icon: 'warn' },
  CANCELLED: { tone: 'neutral', icon: 'fail' },
  CANCELED: { tone: 'neutral', icon: 'fail' },
  VOID: { tone: 'neutral', icon: 'fail' },
  EXPIRED: { tone: 'neutral', icon: 'fail' },
  DISMISSED: { tone: 'neutral', icon: 'fail' },
  REJECTED: { tone: 'danger', icon: 'fail' },
  FAILED: { tone: 'danger', icon: 'fail' },
  FAIL: { tone: 'danger', icon: 'fail' },
  CRITICAL: { tone: 'danger', icon: 'warn' },
  BLOCKED: { tone: 'danger', icon: 'fail' },
};

const ICONS = {
  ok: <Check className="size-3.5" strokeWidth={2.75} aria-hidden />,
  wait: <Clock className="size-3.5" strokeWidth={2.5} aria-hidden />,
  warn: <AlertTriangle className="size-3.5" strokeWidth={2.5} aria-hidden />,
  fail: <X className="size-3.5" strokeWidth={2.75} aria-hidden />,
  frozen: <Snowflake className="size-3.5" strokeWidth={2.5} aria-hidden />,
  dot: <CircleDot className="size-3.5" strokeWidth={2.5} aria-hidden />,
};

export function StatusBadge({ status, label, className }: { status?: string | null; label?: ReactNode; className?: string }) {
  const key = (status ?? '').toUpperCase();
  const meta = STATUS[key] ?? { tone: 'neutral' as Tone, icon: 'dot' as const };
  return (
    <Badge tone={meta.tone} icon={ICONS[meta.icon]} className={className}>
      {label ?? humanize(status)}
    </Badge>
  );
}

/** Pulsing cyan dot for live/connected state. */
export function LiveDot({ live = true, label }: { live?: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold">
      <span className={cx('size-2 rounded-full', live ? 'bg-cyan animate-live' : 'bg-warn')} aria-hidden />
      {label && <span className={live ? 'text-cyan-ink' : 'text-warn-ink'}>{label}</span>}
    </span>
  );
}
