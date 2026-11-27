import { Link } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight, History, Wallet } from 'lucide-react';
import { useAuth } from '@damp/web-shared/auth';
import { truncateMiddle } from '@damp/web-shared/lib';
import { Card } from '@damp/web-shared/ui';
import { readRecent } from '../recent';
import { WORKSPACE_NAV, type Workspace } from '../workspace-config';
import { Section } from './Section';

/** The workspace's pages as round-icon shortcut rows (Tamasha hub rows), minus the overview itself. */
export function QuickActions({ workspace, limit = 6 }: { workspace: Workspace; limit?: number }) {
  const { can } = useAuth();
  const items = WORKSPACE_NAV[workspace]
    .flatMap((g) => g.items)
    .filter((i) => i.to !== '/' && (!i.anyOf || can(...i.anyOf)))
    .slice(0, limit);
  if (items.length === 0) return null;
  return (
    <Section title="Quick actions">
      <Card padded={false} className="p-2">
        <ul className="m-0 grid list-none gap-1 p-0 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
          {items.map((i) => (
            <li key={i.to}>
              <Link to={i.to} className="nudge flex min-h-12 items-center gap-3 rounded-[16px] px-2.5 py-2 text-sm font-semibold text-navy no-underline hover:bg-canvas">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-action-tint text-action">
                  <i.icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate">{i.label}</span>
                <ArrowRight className="size-3.5 shrink-0 text-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  );
}

/** Wallets and transactions opened on this device (see recent.ts), for picking work back up. */
export function RecentlyViewed() {
  const { can } = useAuth();
  const rows = [
    ...(can('wallets:read:any') ? readRecent('wallet').slice(0, 4).map((id) => ({ id, kind: 'Wallet', to: `/wallets/${encodeURIComponent(id)}`, icon: Wallet })) : []),
    ...(can('transactions:read:any') ? readRecent('transaction').slice(0, 4).map((id) => ({ id, kind: 'Transaction', to: `/transactions/${encodeURIComponent(id)}`, icon: ArrowLeftRight })) : []),
  ];
  if (!can('wallets:read:any') && !can('transactions:read:any')) return null;
  return (
    <Section title="Recently viewed">
      <Card padded={false} className="p-2">
        {rows.length === 0 ? (
          <p className="m-0 flex items-center gap-3 px-2.5 py-3 text-[13px] text-muted">
            <History className="size-4 shrink-0 text-subtle" aria-hidden />
            Wallets and transactions you open will show up here.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {rows.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <Link to={r.to} className="flex min-h-12 items-center gap-3 rounded-[16px] px-2.5 py-2 no-underline hover:bg-canvas">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-neutral-tint text-navy">
                    <r.icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[12.5px] text-navy" title={r.id}>
                      {truncateMiddle(r.id, 10, 6)}
                    </span>
                    <span className="block text-xs text-muted">{r.kind}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Section>
  );
}
