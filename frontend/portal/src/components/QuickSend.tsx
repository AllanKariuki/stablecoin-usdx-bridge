import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { paymentsApi, type Beneficiary } from '@damp/web-shared/api/payments';
import { useAsync } from '@damp/web-shared/lib';
import { Callout, Card, CardHeader, Skeleton } from '@damp/web-shared/ui';

/** Theme-true avatar palette; the payee id hashes into it, never the name order. */
const AVATAR_COLORS = [
  { bg: '#1463D6', fg: '#FFFFFF' },
  { bg: '#0E2463', fg: '#1FD3E6' },
  { bg: '#0B6B78', fg: '#FFFFFF' },
  { bg: '#B4530A', fg: '#FFFFFF' },
  { bg: '#6D4ED8', fg: '#FFFFFF' },
  { bg: '#0E9F8E', fg: '#FFFFFF' },
];

const avatarColor = (id: string) => {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

/** The saved payees, as a row of avatar circles; the first circle adds one. */
export default function QuickSend() {
  const payees = useAsync(() => paymentsApi.beneficiaries(), []);
  const shown = useMemo(() => (payees.data ?? []).slice(0, 6), [payees.data]);
  return (
    <Card>
      <CardHeader title="Quick send" description="Your saved payees, one tap away." />
      {payees.loading && !payees.data ? (
        <div className="flex gap-3" aria-busy="true" aria-label="Loading payees">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="size-12 rounded-full" />
          ))}
        </div>
      ) : payees.error ? (
        <Callout tone="warn">We couldn’t load your payees right now.</Callout>
      ) : (
        <ul className="m-0 flex list-none items-start gap-4 overflow-x-auto p-0">
          <li className="shrink-0">
            <Link to="/payments/payees" aria-label="Add a payee" className="group flex w-14 flex-col items-center gap-1.5 no-underline">
              <span className="grid size-12 place-items-center rounded-full border-2 border-dashed border-line-strong text-subtle transition-colors group-hover:border-action group-hover:text-action">
                <Plus className="size-5" aria-hidden />
              </span>
              <span className="text-[11px] font-semibold text-muted group-hover:text-action">Add</span>
            </Link>
          </li>
          {shown.map((p: Beneficiary) => {
            const c = avatarColor(p.id);
            return (
              <li key={p.id} className="shrink-0">
                <Link to={`/send?payee=${encodeURIComponent(p.id)}`} className="group flex w-14 flex-col items-center gap-1.5 no-underline">
                  <span
                    className="grid size-12 place-items-center rounded-full text-sm font-extrabold shadow-card transition-transform group-hover:scale-105"
                    style={{ backgroundColor: c.bg, color: c.fg }}
                    aria-hidden
                  >
                    {initials(p.name)}
                  </span>
                  <span className="max-w-14 truncate text-[11px] font-semibold text-muted group-hover:text-ink">{p.name.split(' ')[0]}</span>
                </Link>
              </li>
            );
          })}
          {shown.length === 0 && <li className="py-3 text-sm text-muted">No payees yet — save someone, then pay them in a couple of taps.</li>}
        </ul>
      )}
    </Card>
  );
}
