import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';
import { HeroPanel } from './Hero';
import { Sparkline } from './Motion';

export function Card({ className, padded = true, interactive = false, ...rest }: HTMLAttributes<HTMLElement> & { padded?: boolean; interactive?: boolean }) {
  return (
    <section
      className={cx('rounded-card border border-line bg-surface shadow-card', padded && 'p-5 sm:p-6', interactive && 'lift', className)}
      {...rest}
    />
  );
}

/** Card title row: eyebrow-style title on the left, actions on the right. */
export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  note,
  icon,
  tone = 'default',
  loading,
  reveal = false,
  delay,
  trend,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'navy' | 'warn';
  loading?: boolean;
  reveal?: boolean;
  delay?: 1 | 2 | 3 | 4 | 5 | 6;
  trend?: number[];
}) {
  const navy = tone === 'navy';
  return (
    <div
      className={cx(
        'flex flex-col gap-1.5 rounded-card border p-5',
        navy ? 'border-navy bg-navy text-on-navy' : tone === 'warn' ? 'border-warn-line bg-warn-bg' : 'border-line bg-surface shadow-card',
        reveal && 'animate-rise',
        delay && `stagger-${delay}`,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cx('text-[13px] font-medium', navy ? 'text-on-navy-muted' : 'text-muted')}>{label}</span>
        {icon && <span className={cx('grid size-8 place-items-center rounded-[10px]', navy ? 'bg-white/10 text-cyan' : 'bg-action-tint text-action')}>{icon}</span>}
      </div>
      {loading ? (
        <span className="skeleton h-8 w-28" />
      ) : (
        <span className={cx('text-[28px] leading-tight font-extrabold tracking-tight', navy ? 'text-white' : tone === 'warn' ? 'text-warn-deep' : 'text-navy')}>{value}</span>
      )}
      {note && <span className={cx('text-xs', navy ? 'text-on-navy-subtle' : 'text-muted')}>{note}</span>}
      {trend && trend.length >= 2 && <Sparkline points={trend} className="mt-1" stroke={navy ? '#1FD3E6' : '#1463D6'} />}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions, hero = false }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; hero?: boolean }) {
  if (hero) {
    return (
      <HeroPanel className="mb-6">
        <header className="flex flex-wrap items-end justify-between gap-4 px-6 py-7 animate-rise sm:px-8 sm:py-8">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-1 text-cyan">{eyebrow}</p>}
            <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-[30px]">{title}</h1>
            {description && <p className="mt-1 max-w-2xl text-[15px] text-on-navy-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      </HeroPanel>
    );
  }
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Label/value rows for detail panels. */
export function KeyValueList({ items, className }: { items: Array<{ label: ReactNode; value: ReactNode; mono?: boolean }>; className?: string }) {
  return (
    <dl className={cx('divide-y divide-line', className)}>
      {items.map((item, i) => (
        <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5">
          <dt className="text-[13px] text-muted">{item.label}</dt>
          <dd className={cx('m-0 min-w-0 text-right text-sm text-ink break-all', item.mono && 'font-mono text-[13px]')}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
