import { cx } from '../lib/cx';

type LogoVariant = 'tile' | 'light' | 'mono';

interface LogoMarkProps {
  size?: number;
  className?: string;
  /** tile (default): navy tile with cyan/white diamonds. light: no tile, navy + action blue. mono: no tile, all navy. */
  variant?: LogoVariant;
  /** Plays the intro once: the diamonds slide in and the overlap pops. */
  animated?: boolean;
}

/**
 * DAMP mark — "Interlock": the ledger and the chain overlap as two stroke
 * diamonds, and the solid diamond where they meet is USD-X.
 */
export function LogoMark({ size = 40, className, variant = 'tile', animated = false }: LogoMarkProps) {
  const tile = variant === 'tile';
  // light swaps cyan for action blue (cyan fails contrast on white) and the
  // white diamond for navy; mono is all navy.
  const left = variant === 'mono' ? '#0E2463' : variant === 'light' ? '#1463D6' : '#1FD3E6';
  const right = variant === 'light' || variant === 'mono' ? '#0E2463' : '#FFFFFF';
  const overlap = variant === 'mono' ? '#0E2463' : variant === 'light' ? '#1463D6' : '#1FD3E6';

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} role="img" aria-label="DAMP">
      {tile && <rect width="48" height="48" rx="14" fill="#0E2463" className={animated ? 'logo-tile-anim' : undefined} />}
      <path d="M19 13L30 24L19 35L8 24Z" fill="none" stroke={left} strokeWidth="3" strokeLinejoin="round" className={animated ? 'logo-left-anim' : undefined} />
      <path d="M29 13L40 24L29 35L18 24Z" fill="none" stroke={right} strokeWidth="3" strokeLinejoin="round" className={animated ? 'logo-right-anim' : undefined} />
      <path d="M24 18.5L29.5 24L24 29.5L18.5 24Z" fill={overlap} className={animated ? 'logo-pop-anim' : undefined} />
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
