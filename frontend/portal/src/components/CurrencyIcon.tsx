import { cx } from '@damp/web-shared/lib';
import { currencyMeta } from '../lib/currency';

/**
 * A currency's identity: a plain coloured circle with its glyph (BTC ₿,
 * ETH Ξ, SOL ◎, USD $, EUR €, GBP £, KES KSh, USD-X X), plus a chain chip
 * where the same currency can live on more than one chain.
 */
export default function CurrencyIcon({
  currency,
  chain,
  size = 'md',
  className,
}: {
  currency: string;
  /** Shown as a small chip on USD-X (one wallet per chain). */
  chain?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const meta = currencyMeta(currency);
  const box = { sm: 'size-8 text-[11px]', md: 'size-10 text-[13px]', lg: 'size-12 text-[15px]' }[size];
  const chip = chain ? chain.toLowerCase() : null;
  return (
    <span className={cx('relative inline-flex shrink-0', className)} aria-hidden>
      <span
        className={cx('grid place-items-center rounded-full font-extrabold select-none', box, meta.small && 'text-[9px]')}
        style={{ backgroundColor: meta.color, color: meta.onColor }}
        title={`${meta.name}${chip ? ` on ${chip}` : ''}`}
      >
        {meta.glyph}
      </span>
      {chip && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-line bg-surface px-1 py-px font-mono text-[8px] font-bold uppercase text-muted">
          {chip === 'ethereum' ? 'eth' : chip === 'solana' ? 'sol' : chip}
        </span>
      )}
    </span>
  );
}
