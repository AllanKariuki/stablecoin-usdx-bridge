import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, ShieldCheck, XOctagon } from 'lucide-react';
import { cx } from '../lib/cx';
import { Button } from './Button';
import { Logo } from './Logo';

type CalloutTone = 'info' | 'warn' | 'danger' | 'success' | 'navy';

const CALLOUT: Record<CalloutTone, { box: string; icon: ReactNode; title: string; body: string }> = {
  info: { box: 'bg-action-tint border-action/20', icon: <Info className="size-5 text-action" aria-hidden />, title: 'text-navy', body: 'text-neutral-ink' },
  warn: { box: 'bg-warn-bg border-warn-line', icon: <AlertTriangle className="size-5 text-warn" aria-hidden />, title: 'text-warn-deep', body: 'text-warn-deep' },
  danger: { box: 'bg-danger-tint border-danger-line', icon: <XOctagon className="size-5 text-danger" aria-hidden />, title: 'text-danger-ink', body: 'text-danger-ink' },
  success: { box: 'bg-cyan-tint border-cyan/40', icon: <CheckCircle2 className="size-5 text-cyan-ink" aria-hidden />, title: 'text-cyan-ink', body: 'text-cyan-ink' },
  navy: { box: 'bg-navy border-navy', icon: <ShieldCheck className="size-5 text-cyan" aria-hidden />, title: 'text-white', body: 'text-on-navy-muted' },
};

/** Inline message block. `role="alert"` for errors so screen readers announce them. */
export function Callout({ tone = 'info', title, children, action, className }: { tone?: CalloutTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const s = CALLOUT[tone];
  return (
    <div
      role={tone === 'danger' || tone === 'warn' ? 'alert' : 'status'}
      className={cx('flex items-start gap-3 rounded-2xl border px-4 py-3.5 animate-pop', s.box, className)}
    >
      <span className="mt-0.5 shrink-0">{s.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className={cx('text-sm font-bold', s.title)}>{title}</p>}
        {children && <div className={cx('text-[13px] leading-relaxed', s.body, Boolean(title) && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-action', className)} aria-label={label} role="status" />;
}

/** Used only before a shell exists (auth bootstrap, callback). Inside a shell, use skeletons. */
export function FullPageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-shell px-4">
      <div className="flex flex-col items-center gap-5 animate-rise">
        <Logo size={44} />
        <div className="flex items-center gap-2.5 text-sm font-semibold text-muted" role="status">
          <Loader2 className="size-4 animate-spin text-action" aria-hidden />
          {label}…
        </div>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx('skeleton block h-4', className)} />;
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-3', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-[10px]" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      {icon && <span className="grid size-14 place-items-center rounded-2xl bg-action-tint text-action">{icon}</span>}
      <h3 className="text-base font-bold text-navy">{title}</h3>
      {children && <p className="max-w-sm text-sm leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "This didn't load", message, onRetry, className }: { title?: ReactNode; message: ReactNode; onRetry?: () => void; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center gap-3 px-6 py-12 text-center', className)} role="alert">
      <span className="grid size-14 place-items-center rounded-2xl bg-warn-tint text-warn">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h3 className="text-base font-bold text-navy">{title}</h3>
      <p className="max-w-sm text-sm leading-relaxed text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RefreshCw className="size-3.5" aria-hidden />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
