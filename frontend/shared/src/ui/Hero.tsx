import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { DecorDiamonds } from './Motion';

/** Navy rounded band with a dot grid and spinning diamond motif — the top of internal dashboards. */
export function HeroPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx('relative overflow-hidden rounded-shell bg-navy text-white', className)}>
      <DecorDiamonds size={820} className="absolute -right-[300px] -top-[280px] opacity-[0.13]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px)', backgroundSize: '26px 26px' }}
      />
      <div className="relative">{children}</div>
    </section>
  );
}

const ICON_TONES: Record<'action' | 'cyan' | 'warn' | 'navy', string> = {
  action: 'bg-action-tint text-action',
  cyan: 'bg-cyan-tint text-cyan-ink',
  warn: 'bg-warn-tint text-warn',
  navy: 'bg-navy text-cyan',
};

/** Lifting card with an icon tile, a title, muted body and an optional bottom visual. */
export function FeatureCard({
  icon,
  iconTone = 'action',
  title,
  children,
  visual,
  dark = false,
  className,
}: {
  icon: ReactNode;
  iconTone?: 'action' | 'cyan' | 'warn' | 'navy';
  title: ReactNode;
  children: ReactNode;
  visual?: ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <article className={cx('lift flex flex-col gap-4 rounded-[26px] border p-6', dark ? 'border-transparent bg-navy' : 'border-line bg-surface', className)}>
      <span className={cx('grid size-[46px] place-items-center rounded-[14px]', dark ? 'bg-cyan/15 text-cyan' : ICON_TONES[iconTone])}>{icon}</span>
      <div className="flex flex-col gap-2">
        <h3 className={cx('text-[19px] font-extrabold leading-snug', dark ? 'text-white' : 'text-navy')}>{title}</h3>
        <div className={cx('text-sm leading-relaxed', dark ? 'text-on-navy-muted' : 'text-muted')}>{children}</div>
      </div>
      {visual && <div className="mt-auto">{visual}</div>}
    </article>
  );
}
