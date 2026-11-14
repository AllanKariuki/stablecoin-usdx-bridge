import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cx } from '../lib/cx';

/** Route-backed tabs: each tab is a link, so tabs are deep-linkable and history works. */
export function NavTabs({ tabs, className }: { tabs: Array<{ to: string; label: ReactNode; end?: boolean; count?: number }>; className?: string }) {
  return (
    <nav className={cx('mb-5 flex gap-1 overflow-x-auto border-b border-line', className)} aria-label="Sections">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cx(
              '-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold whitespace-nowrap no-underline transition-colors',
              isActive ? 'border-action text-navy' : 'border-transparent text-muted hover:text-ink',
            )
          }
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-neutral-tint px-2 py-0.5 text-[11px] text-neutral-ink">{t.count}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

/** State-backed tabs for in-page switching. */
export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: Array<{ value: T; label: ReactNode; count?: number }>; className?: string }) {
  return (
    <div role="tablist" className={cx('mb-5 flex gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            '-mb-px inline-flex min-h-11 cursor-pointer items-center gap-2 border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors',
            value === t.value ? 'border-action text-navy' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-neutral-tint px-2 py-0.5 text-[11px] text-neutral-ink">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
