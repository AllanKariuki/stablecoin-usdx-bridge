import { useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, Copy } from 'lucide-react';
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
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!loading && rows && rows.length === 0 && empty) {
    return <EmptyState title={empty.title} icon={empty.icon} action={empty.action}>{empty.body}</EmptyState>;
  }
  const hide = (c: Column<T>) => (c.hideOnMobile ? 'hidden md:table-cell' : '');
  return (
    <div className={cx('overflow-x-auto', className)}>
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
            : rows?.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={cx('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-canvas focus-visible:bg-canvas')}
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
