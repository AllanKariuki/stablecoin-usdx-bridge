import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cx } from '@damp/web-shared/lib';

/** Tamasha-style section: an eyebrow title with an optional action, sitting above its content rather than inside a card. */
export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('flex min-w-0 flex-col', className)}>
      <div className="mb-3 flex min-h-6 items-center justify-between gap-3 px-1">
        <h2 className="eyebrow m-0">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SeeAll({ to, label = 'See all' }: { to: string; label?: string }) {
  return (
    <Link to={to} className="nudge inline-flex items-center gap-1 text-[13px] font-semibold text-action no-underline hover:underline">
      {label} <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}
