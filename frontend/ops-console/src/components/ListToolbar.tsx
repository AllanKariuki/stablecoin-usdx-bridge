import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { cx } from '@damp/web-shared/lib';

/** The row above a list table, inside its card: filters on the left, search on the right. */
export function ListToolbar({ children, search, className }: { children?: ReactNode; search?: { value: string; onChange: (v: string) => void; placeholder: string }; className?: string }) {
  return (
    <div className={cx('mb-4 flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {search && (
        <label className="relative flex min-w-0 flex-1 items-center sm:max-w-xs">
          <span className="sr-only">{search.placeholder}</span>
          <Search className="pointer-events-none absolute left-3.5 size-4 text-subtle" aria-hidden />
          <input
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            className="min-h-10 w-full rounded-full border border-line bg-canvas pr-9 pl-10 text-sm text-ink outline-none placeholder:text-subtle focus:border-action/40 focus:bg-surface focus:ring-2 focus:ring-action/20 [&::-webkit-search-cancel-button]:hidden"
          />
          {search.value && (
            <button type="button" aria-label="Clear search" onClick={() => search.onChange('')} className="absolute right-2 grid size-7 cursor-pointer place-items-center rounded-full text-subtle hover:bg-neutral-tint hover:text-ink">
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </label>
      )}
    </div>
  );
}

export interface SummaryItem {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'warn' | 'action' | 'cyan';
}

const TONES: Record<NonNullable<SummaryItem['tone']>, string> = {
  default: 'bg-neutral-tint text-navy',
  warn: 'bg-warn-tint text-warn-ink',
  action: 'bg-action-tint text-action-ink',
  cyan: 'bg-cyan-tint text-cyan-ink',
};

/** A compact row of counts above a list, computed from rows the page already has. */
export function SummaryStrip({ items, loading }: { items: SummaryItem[]; loading?: boolean }) {
  if (items.length === 0) return null;
  return (
    <ul aria-label="Summary" className="m-0 mb-5 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
      {items.map((i) => (
        <li key={i.label} className="card-soft flex items-center gap-3 px-4 py-3.5">
          <span className={cx('grid min-w-10 place-items-center rounded-full px-2.5 py-1.5 text-base font-semibold tabular-nums', TONES[i.tone ?? 'default'])}>
            {loading ? <span className="skeleton block h-4 w-5" /> : i.value}
          </span>
          <span className="text-[13px] leading-tight text-muted">{i.label}</span>
        </li>
      ))}
    </ul>
  );
}
