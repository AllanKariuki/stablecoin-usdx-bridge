import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, CheckSquare, Coins, ReceiptText } from 'lucide-react';
import { apiErrorMessage, approvalsApi, ledgerApi } from '@damp/web-shared/api';
import { Can, useAuth } from '@damp/web-shared/auth';
import { useAsync } from '@damp/web-shared/lib';
import { Callout, Card, CardHeader, EmptyState, ErrorState, LinkButton, MoneyText, PageHeader, Skeleton, SkeletonRows, StatusBadge } from '@damp/web-shared/ui';
import { Link } from 'react-router-dom';
import KycBanner from '../components/KycBanner';
import TransactionDrawer, { TransactionRow } from '../components/TransactionDrawer';

const ACTIONS = [
  { to: '/move/deposit', label: 'Deposit', icon: ArrowDownToLine, anyOf: ['wallets:write:own'] as const },
  { to: '/move/transfer', label: 'Transfer', icon: ArrowLeftRight, anyOf: ['wallets:write:own'] as const },
  { to: '/move/withdraw', label: 'Withdraw', icon: ArrowUpFromLine, anyOf: ['wallets:write:own'] as const },
  { to: '/usdx', label: 'Issue / redeem USD-X', icon: Coins, anyOf: ['issuance:create', 'redemption:create'] as const },
];

function PendingApprovals() {
  const pending = useAsync(() => approvalsApi.list(), []);
  const count = pending.data?.filter((r) => r.status === 'PENDING').length ?? 0;
  if (!count) return null;
  return (
    <Callout tone="info" title={`${count} request${count === 1 ? '' : 's'} awaiting your approval`} action={<LinkButton to="/approvals" size="sm" variant="secondary" icon={<CheckSquare className="size-4" aria-hidden />}>Review</LinkButton>}>
      Payouts over your organisation’s limit need a second person to approve them.
    </Callout>
  );
}

export default function HomePage() {
  const { user, can } = useAuth();
  const dash = useAsync(() => ledgerApi.dashboard(), []);
  const [openTx, setOpenTx] = useState<string | null>(null);
  const ownIds = useMemo(() => new Set(dash.data?.wallets.map((w) => w.id) ?? []), [dash.data]);
  const firstName = user?.name.split(' ')[0];

  return (
    <>
      <PageHeader eyebrow="Home" title={firstName ? `Hello, ${firstName}` : 'Hello'} description="Your balances, recent activity and what needs your attention." />

      <div className="flex flex-col gap-4">
        <KycBanner />
        <Can anyOf={['approvals:decide']}>
          <PendingApprovals />
        </Can>
      </div>

      <section aria-label="Balances" className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dash.loading ? (
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rounded-card border border-line bg-surface p-5">
              <Skeleton className="w-24" />
              <Skeleton className="mt-3 h-8 w-36" />
            </div>
          ))
        ) : dash.error ? (
          <Card className="sm:col-span-2 xl:col-span-4">
            <ErrorState message={apiErrorMessage(dash.error)} onRetry={dash.reload} />
          </Card>
        ) : dash.data?.wallets.length ? (
          dash.data.wallets.map((w, i) => (
            <Link
              key={w.id}
              to={`/wallets/${w.id}`}
              className={`group flex flex-col gap-2 rounded-card border p-5 no-underline transition-shadow hover:shadow-pop ${i === 0 ? 'border-navy bg-navy text-white' : 'border-line bg-surface text-ink shadow-card'}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`text-[13px] font-semibold ${i === 0 ? 'text-on-navy-muted' : 'text-muted'}`}>
                  {w.currency}
                  {w.chain ? ` · ${w.chain.toLowerCase()}` : ''} · {w.label || 'Wallet'}
                </span>
                {w.status.toUpperCase() !== 'ACTIVE' && <StatusBadge status={w.status} />}
              </span>
              <MoneyText money={w.balance} size="xl" className={i === 0 ? 'text-white' : 'text-navy'} />
            </Link>
          ))
        ) : (
          <Card className="sm:col-span-2 xl:col-span-4">
            <EmptyState title="No wallets yet" action={can('wallets:write:own') ? <LinkButton to="/move/deposit">Make your first deposit</LinkButton> : undefined}>
              Your first deposit opens a wallet in that currency.
            </EmptyState>
          </Card>
        )}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Recent activity" actions={<LinkButton to="/transactions" variant="ghost" size="sm">See all</LinkButton>} />
          {dash.loading ? (
            <SkeletonRows rows={5} />
          ) : dash.error ? null : dash.data?.recentTransactions.length ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {dash.data.recentTransactions.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} ownWalletIds={ownIds} onOpen={setOpenTx} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={<ReceiptText className="size-6" aria-hidden />} title="No activity yet">
              Deposits, transfers and USD-X movements will show up here.
            </EmptyState>
          )}
        </Card>

        <Card>
          <CardHeader title="Quick actions" />
          <div className="grid grid-cols-2 gap-2.5">
            {ACTIONS.filter((a) => can(...a.anyOf)).map((a) => (
              <Link key={a.to} to={a.to} className="flex min-h-24 flex-col justify-between gap-3 rounded-[16px] border border-line bg-canvas p-3.5 text-sm font-bold text-navy no-underline transition-colors hover:border-action/40 hover:bg-action-tint">
                <span className="grid size-9 place-items-center rounded-[11px] bg-surface text-action shadow-card">
                  <a.icon className="size-[18px]" aria-hidden />
                </span>
                {a.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <TransactionDrawer transactionId={openTx} onClose={() => setOpenTx(null)} />
    </>
  );
}
