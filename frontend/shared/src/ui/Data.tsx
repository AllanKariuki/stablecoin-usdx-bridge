import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { cx } from '../lib/cx';
import { truncateMiddle } from '../lib/format';
import { isNegative, type Money } from '../api/money';
import { Button } from './Button';
import { EmptyState, ErrorState, Skeleton } from './Feedback';

/**
 * Renders a Money's server-formatted `display` — never arithmetic on
 * `amount`. With `signed`, a negative amount gets an explicit sign, an
 * arrow and the orange "against" ink, so sign never rests on colour alone.
 */
export function MoneyText({ money, signed, className, size = 'md' }: { money: Money; signed?: boolean; className?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const negative = isNegative(money);
  const sizes = { sm: 'text-[13px]', md: 'text-sm', lg: 'text-lg', xl: 'text-[32px] leading-none tracking-tight' };
  return (
    <span className={cx('inline-flex items-center gap-1 font-semibold tabular-nums whitespace-nowrap', sizes[size], signed && (negative ? 'text-warn-ink' : 'text-action-ink'), className)}>
      {signed && (negative ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownLeft className="size-3.5" aria-hidden />)}
      {signed && !negative && <span aria-hidden>+</span>}
      <span>{money.display}</span>
      {signed && <span className="sr-only">{negative ? '(debit)' : '(credit)'}</span>}
    </span>
  );
}

/** Monospace reference (ids, hashes, tx refs) with copy-to-clipboard. */
export function MonoRef({ value, truncate = true, href, className }: { value: string; truncate?: boolean; href?: string | null; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-subtle">—</span>;
  const shown = truncate ? truncateMiddle(value, 8, 6) : value;
  return (
    <span className={cx('inline-flex items-center gap-1.5 font-mono text-[12.5px] text-navy', className)}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="text-action underline-offset-2 hover:underline" title={value}>
          {shown}
        </a>
      ) : (
        <span title={value}>{shown}</span>
      )}
      <button
        type="button"
        aria-label={copied ? 'Copied' : `Copy ${value}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        className="inline-grid size-6 cursor-pointer place-items-center rounded-md text-subtle hover:bg-neutral-tint hover:text-ink"
      >
        {copied ? <Check className="size-3.5 text-cyan-ink" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
    </span>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
  /** Hide below the md breakpoint to keep phone tables readable. */
  hideOnMobile?: boolean;
}

/**
 * Dense list table for queues and ledgers. Rows are buttons-in-disguise when
 * `onRowClick` is set: Enter/Space activate them, so keyboard operators can
 * work a queue without a mouse. Wide tables scroll inside their own box.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  empty,
  onRowClick,
  caption,
  className,
  pageSize,
  pageSizeOptions,
  resetKey,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: ReactNode;
  onRetry?: () => void;
  empty?: { title: ReactNode; body?: ReactNode; icon?: ReactNode; action?: ReactNode };
  onRowClick?: (row: T) => void;
  caption?: string;
  className?: string;
  /** Client-side pagination over `rows`. Omit to render every row (the default). */
  pageSize?: number;
  /** Offer a page-size picker with these sizes (needs `pageSize`). */
  pageSizeOptions?: number[];
  /** Back to page 1 whenever this changes — pass the active filter or search text. */
  resetKey?: unknown;
}) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize ?? 0);
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (!Object.is(resetKey, lastResetKey)) {
    setLastResetKey(resetKey);
    setPage(1);
  }
  const total = rows?.length ?? 0;
  const pages = size ? Math.max(1, Math.ceil(total / size)) : 1;
  // Clamp rather than reset: a refetch that drops rows (an alert dismissed on
  // the last page) lands on the new last page instead of jumping to the top.
  const current = Math.min(page, pages);
  const visible = size && rows ? rows.slice((current - 1) * size, current * size) : rows;
  const risenOnce = useRef(false);
  // Spend the stagger after the first batch commits. Setting the ref in an
  // effect (not during render) keeps StrictMode's double render from seeing
  // it already set, which would suppress the first-batch animation entirely.
  useEffect(() => {
    if (rows && rows.length > 0) risenOnce.current = true;
  }, [rows]);
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!loading && rows && rows.length === 0 && empty) {
    return <EmptyState title={empty.title} icon={empty.icon} action={empty.action}>{empty.body}</EmptyState>;
  }
  // Stagger only the first batch of rows, not every refetch.
  const firstBatch = !risenOnce.current && !!rows?.length;
  const hide = (c: Column<T>) => (c.hideOnMobile ? 'hidden md:table-cell' : '');
  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-line">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cx('eyebrow px-3 py-2.5 text-[11px] font-bold first:pl-0 last:pr-0', c.align === 'right' ? 'text-right' : 'text-left', hide(c))}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !rows?.length
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    {columns.map((c) => (
                      <td key={c.key} className={cx('px-3 py-3.5 first:pl-0 last:pr-0', hide(c))}>
                        <Skeleton className="h-3.5 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : visible?.map((row, i) => (
                  <tr
                    key={rowKey(row)}
                    className={cx('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-canvas focus-visible:bg-canvas', firstBatch && 'animate-rise')}
                    style={firstBatch ? { animationDelay: `${Math.min(i, 10) * 30}ms` } : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRowClick(row)) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cx('px-3 py-3 align-middle first:pl-0 last:pr-0', c.align === 'right' && 'text-right', hide(c), c.className)}>
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {size > 0 && total > Math.min(size, ...(pageSizeOptions ?? [size])) && (
        <Pagination
          page={current}
          pageSize={size}
          total={total}
          onPageChange={setPage}
          pageSizeOptions={pageSizeOptions}
          onPageSizeChange={(n) => {
            setSize(n);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}

/** Page numbers to show: all of them up to seven, else the ends and the current page's neighbours. */
export function pageWindow(current: number, pages: number): Array<number | 'gap'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: Array<number | 'gap'> = [1];
  const from = Math.max(2, Math.min(current - 1, pages - 4));
  const to = Math.min(pages - 1, Math.max(current + 1, 5));
  if (from > 2) out.push('gap');
  for (let n = from; n <= to; n++) out.push(n);
  if (to < pages - 1) out.push('gap');
  out.push(pages);
  return out;
}

/**
 * Page footer for client-side paged lists: "Showing 11–20 of 84", numbered
 * pages and pill prev/next, plus an optional page-size picker.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const step = 'inline-grid size-9 cursor-pointer place-items-center rounded-full text-[13px] font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <nav aria-label="Pagination" className={cx('mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4', className)}>
      <p className="m-0 text-[13px] text-muted tabular-nums">
        Showing <span className="font-semibold text-ink">{first}–{last}</span> of <span className="font-semibold text-ink">{total}</span>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {pageSizeOptions && onPageSizeChange && (
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Rows
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="min-h-9 cursor-pointer rounded-full border border-line bg-surface px-3 text-[13px] font-semibold text-ink"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={cx(step, 'border border-line bg-surface text-navy hover:bg-canvas')}>
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          {pageWindow(page, pages).map((n, i) =>
            n === 'gap' ? (
              <span key={`gap-${i}`} aria-hidden className="inline-grid size-9 place-items-center text-[13px] text-subtle">
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                aria-label={`Page ${n}`}
                aria-current={n === page ? 'page' : undefined}
                onClick={() => onPageChange(n)}
                className={cx(step, n === page ? 'bg-navy text-white' : 'text-muted hover:bg-canvas hover:text-navy')}
              >
                {n}
              </button>
            ),
          )}
          <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPageChange(page + 1)} className={cx(step, 'border border-line bg-surface text-navy hover:bg-canvas')}>
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </nav>
  );
}

/** Cursor pagination footer: the backend pages by cursor, never by offset. */
export function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading?: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center pt-4">
      <Button variant="secondary" size="sm" loading={loading} onClick={onClick}>
        Load more
      </Button>
    </div>
  );
}
