import { cx } from '../lib/cx';

/**
 * DAMP mark: two interlocking rounded squares turned 45° — the ledger and
 * the chain, overlapping where USD-X lives. Cyan on navy.
 */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} role="img" aria-label="DAMP">
      <rect width="48" height="48" rx="14" fill="#0E2463" />
      <rect x="10" y="14" width="16" height="16" rx="3.5" transform="rotate(45 18 22)" fill="none" stroke="#1FD3E6" strokeWidth="3" />
      <rect x="22" y="18" width="16" height="16" rx="3.5" transform="rotate(45 30 26)" fill="none" stroke="#FFFFFF" strokeWidth="3" />
    </svg>
  );
}

export function Logo({ size = 36, subtitle, inverted, className }: { size?: number; subtitle?: string; inverted?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <span className={cx('text-lg font-extrabold tracking-tight', inverted ? 'text-white' : 'text-navy')}>DAMP</span>
        {subtitle && <span className={cx('mt-1 text-[11px] font-semibold uppercase tracking-[0.08em]', inverted ? 'text-on-navy-subtle' : 'text-muted')}>{subtitle}</span>}
      </span>
    </span>
  );
}
