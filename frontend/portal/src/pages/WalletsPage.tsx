import { Coins, Plus, Snowflake, Wallet as WalletIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@damp/web-shared/api';
import { Can } from '@damp/web-shared/auth';
import { Card, EmptyState, ErrorState, LinkButton, MonoRef, MoneyText, PageHeader, Skeleton, StatusBadge } from '@damp/web-shared/ui';
import { isFrozen, useWallets } from '../hooks/useWallets';

export default function WalletsPage() {
  const wallets = useWallets();
  return (
    <>
      <PageHeader
        eyebrow="Wallets"
        title="Your wallets"
        description="One balance per currency, plus USD-X on each chain you use."
        actions={
          <>
            <Can anyOf={['wallets:write:own']}>
              <LinkButton to="/move/deposit" variant="secondary" icon={<Plus className="size-4" aria-hidden />}>
                Deposit
              </LinkButton>
            </Can>
            <Can anyOf={['issuance:create']}>
              <LinkButton to="/usdx" icon={<Coins className="size-4" aria-hidden />}>
                USD-X
              </LinkButton>
            </Can>
          </>
        }
      />
      {wallets.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i}>
              <Skeleton className="w-24" />
              <Skeleton className="mt-4 h-8 w-40" />
              <Skeleton className="mt-6 w-32" />
            </Card>
          ))}
        </div>
      ) : wallets.error ? (
        <Card>
          <ErrorState message={apiErrorMessage(wallets.error)} onRetry={wallets.reload} />
        </Card>
      ) : !wallets.data?.length ? (
        <Card>
          <EmptyState icon={<WalletIcon className="size-6" aria-hidden />} title="No wallets yet" action={<LinkButton to="/move/deposit">Make a deposit</LinkButton>}>
            A wallet opens the first time money arrives in a currency.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {wallets.data.map((w) => (
            <Link key={w.id} to={`/wallets/${w.id}`} className="group flex flex-col gap-4 rounded-card border border-line bg-surface p-6 text-ink no-underline shadow-card transition-shadow hover:shadow-pop">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-[14px] bg-navy text-[13px] font-extrabold text-cyan">{w.currency.slice(0, 4)}</span>
                  <div>
                    <p className="text-sm font-bold text-ink">{w.label || w.currency}</p>
                    <p className="text-xs text-muted">{w.chain ? `On ${w.chain.toLowerCase()}` : 'Fiat'}</p>
                  </div>
                </div>
                <StatusBadge status={w.status} />
              </div>
              <MoneyText money={w.balance} size="xl" className="text-navy" />
              {isFrozen(w) ? (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-warn-ink">
                  <Snowflake className="size-3.5" aria-hidden /> Frozen — see details
                </p>
              ) : w.address ? (
                <MonoRef value={w.address} />
              ) : (
                <span className="text-xs text-muted">View statement →</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
