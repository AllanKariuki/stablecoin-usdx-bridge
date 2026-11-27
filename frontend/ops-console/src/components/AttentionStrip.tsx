import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { cx } from '@damp/web-shared/lib';

export interface AttentionItem {
  key: string;
  /** Noun for the pill, e.g. "KYC waiting". */
  label: string;
  to: string;
  count: number | undefined;
  loading: boolean;
}

/**
 * Glass pills in the overview hero summarising what is waiting on someone.
 * Zero-count items drop out; when everything is loaded and zero it says so.
 */
export function AttentionStrip({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  const loading = items.some((i) => i.loading);
  const waiting = items.filter((i) => (i.count ?? 0) > 0);
  const pill = 'inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-white/10 py-1.5 pr-4 pl-1.5 text-sm font-medium text-white no-underline backdrop-blur-md';

  if (loading && waiting.length === 0) {
    return (
      <div className="flex flex-wrap gap-2" aria-busy="true">
        {items.map((i) => (
          <span key={i.key} className="h-10 w-36 animate-pulse rounded-full bg-white/10" />
        ))}
      </div>
    );
  }
  if (waiting.length === 0) {
    return (
      <p className={cx(pill, 'm-0 w-fit pl-3')}>
        <CheckCircle2 className="size-4 text-cyan" aria-hidden />
        All clear: nothing is waiting on you
      </p>
    );
  }
  return (
    <ul aria-label="Needs attention" className="m-0 flex list-none flex-wrap gap-2 p-0">
      {waiting.map((i) => (
        <li key={i.key}>
          <Link to={i.to} className={cx(pill, 'transition-colors hover:bg-white/18')}>
            <span className="grid min-w-7 place-items-center rounded-full bg-cyan px-2 py-0.5 text-[13px] font-semibold tabular-nums text-navy">{i.count}</span>
            {i.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
