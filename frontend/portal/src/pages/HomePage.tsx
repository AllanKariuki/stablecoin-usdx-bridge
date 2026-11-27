import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckSquare, Eye, EyeOff, ReceiptText, Star } from 'lucide-react';
import { approvalsApi, apiErrorMessage, ledgerApi, ratesApi, type Wallet } from '@damp/web-shared/api';
import { Can, useAuth } from '@damp/web-shared/auth';
import { useAsync } from '@damp/web-shared/lib';
import { Badge, Callout, Card, CardHeader, EmptyState, ErrorState, IconButton, LinkButton, Logo, Skeleton, SkeletonRows, StatusBadge } from '@damp/web-shared/ui';
import KycBanner from '../components/KycBanner';
import TransactionDrawer, { TransactionRow } from '../components/TransactionDrawer';
import MarketsChart from '../components/MarketsChart';
import QuickSend from '../components/QuickSend';
import SwapCard from '../components/SwapCard';
import CurrencyIcon from '../components/CurrencyIcon';
import { boardRates, change24hFor, formatPct, formatUsd, portfolioTotal, walletUsdValue, type RateMap } from '../lib/portfolio';
import { currencyMeta } from '../lib/currency';
import { toggleBalancesHidden, useBalancesHidden } from '../lib/balancesVisibility';

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

/** The 24h change badge — icon + sign, colour never carries it alone. */
function ChangeBadge({ pct }: { pct: string | null }) {
  if (pct === null) return <Badge tone="neutral">—</Badge>;
  const up = !pct.startsWith('-');
  return (
    <Badge tone="neutral" className={up ? 'text-cyan-ink' : 'text-warn-ink'}>
      {up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
      {formatPct(pct)}
      <span className="sr-only">{up ? '(up)' : '(down)'}</span>
    </Badge>
  );
}

/** One row of "My portfolio": icon, name, units, USD value, 24h change, default star. */
function PortfolioRow({ wallet, rates, hidden }: { wallet: Wallet; rates: RateMap; hidden: boolean }) {
  const usd = walletUsdValue(wallet, rates);
  const change = change24hFor(wallet.currency, rates);
  return (
    <Link to={`/wallets/${wallet.id}`} className="group flex items-center gap-3 rounded-[14px] px-2 py-2.5 no-underline hover:bg-canvas">
      <CurrencyIcon currency={wallet.currency} chain={wallet.chain} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
          {wallet.label || currencyMeta(wallet.currency).name}
          {wallet.isDefault && <Star className="size-3.5 shrink-0 fill-warn text-warn" aria-label="Default wallet" />}
        </span>
        <span className="block text-xs text-muted">
          {currencyMeta(wallet.currency).name}
          {wallet.chain ? ` · on ${wallet.chain.toLowerCase()}` : ''}
          {wallet.status.toUpperCase() !== 'ACTIVE' && <StatusBadge status={wallet.status} className="ml-2" />}
        </span>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <span className="font-mono text-[13px] font-semibold tabular-nums text-navy">{hidden ? '••••••' : wallet.balance.display}</span>
        <span className="font-mono text-[11px] tabular-nums text-muted">{hidden ? '••••••' : usd === null ? 'price unavailable' : formatUsd(usd)}</span>
      </span>
      {change !== null && (
        <span className="hidden sm:block">
          <ChangeBadge pct={change} />
        </span>
      )}
    </Link>
  );
}

export default function HomePage() {
  const { user, can } = useAuth();
  const dash = useAsync(() => ledgerApi.dashboard(), []);
  const rates = useAsync(() => ratesApi.rates('USD'), []);
  const [openTx, setOpenTx] = useState<string | null>(null);
  const hidden = useBalancesHidden();

  const ownIds = useMemo(() => new Set(dash.data?.wallets.map((w) => w.id) ?? []), [dash.data]);
  const rateMap = useMemo(() => boardRates(rates.data), [rates.data]);
  const total = useMemo(() => portfolioTotal(dash.data?.wallets ?? [], rateMap), [dash.data, rateMap]);
  const firstName = user?.name.split(' ')[0];

  const balanceError = dash.error || rates.error;

  return (
    <>
      {balanceError && (
        <div className="mb-4">
          <Card>
            <ErrorState message={apiErrorMessage(balanceError)} onRetry={() => (dash.reload(), rates.reload())} />
          </Card>
        </div>
      )}

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow mb-1">Home</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-[30px]">{firstName ? `Hello, ${firstName}` : 'Hello'}</h1>
          <p className="mt-1 text-[15px] text-muted">Your portfolio across fiat, crypto and USD-X.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-semibold text-muted">Total portfolio value</p>
            {dash.loading || rates.loading ? (
              <Skeleton className="ml-auto mt-1 h-8 w-32" />
            ) : (
              <p className="font-mono text-[28px] leading-tight font-extrabold tabular-nums tracking-tight text-navy">
                {hidden ? '••••••' : total.total === null ? '—' : formatUsd(total.total)}
              </p>
            )}
          </div>
          <IconButton label={hidden ? 'Show balances' : 'Hide balances'} aria-pressed={hidden} onClick={toggleBalancesHidden}>
            {hidden ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </IconButton>
        </div>
      </header>
      {!balanceError && total.missingSome && !hidden && (
        <p className="-mt-3 mb-4 text-xs text-muted">Some prices are unavailable right now, so a few balances are left out of the total.</p>
      )}

      <div className="flex flex-col gap-4">
        <KycBanner />
        <Can anyOf={['approvals:decide']}>
          <PendingApprovals />
        </Can>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <MarketsChart rates={rateMap} />
        </div>

        <div className="flex flex-col gap-5 lg:col-span-5">
          <section aria-label="Pay with anything" className="relative overflow-hidden rounded-card bg-gradient-to-br from-navy via-[#0E2463] to-[#1463D6] p-6 text-white shadow-card">
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
            <div className="relative">
              <Logo inverted />
              <h2 className="mt-4 text-xl font-extrabold tracking-tight text-white sm:text-2xl">Pay with anything.</h2>
              <p className="mt-1 max-w-xs text-sm leading-relaxed text-on-navy-muted">Hold fiat and crypto, pay in any currency, convert in seconds.</p>
            </div>
          </section>

          <QuickSend />

          <SwapCard onChanged={() => (dash.reload(), rates.reload())} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader
            title="My portfolio"
            description="Every wallet, valued in dollars at the live rate."
            actions={<LinkButton to="/wallets" variant="ghost" size="sm" iconRight={<ArrowRight className="size-4" aria-hidden />}>Edit</LinkButton>}
          />
          {dash.loading ? (
            <SkeletonRows rows={4} />
          ) : dash.error ? null : !dash.data?.wallets.length ? (
            <EmptyState title="No wallets yet" action={can('wallets:write:own') ? <LinkButton to="/move/deposit">Make your first deposit</LinkButton> : undefined}>
              Your first deposit opens a wallet in that currency.
            </EmptyState>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {dash.data.wallets.map((w) => (
                <li key={w.id} className="animate-rise">
                  <PortfolioRow wallet={w} rates={rateMap} hidden={hidden} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="Recent activity" actions={<LinkButton to="/transactions" variant="ghost" size="sm">See all</LinkButton>} />
          {dash.loading ? (
            <SkeletonRows rows={5} />
          ) : dash.error ? null : dash.data?.recentTransactions.length ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {dash.data.recentTransactions.slice(0, 6).map((tx) => (
                <TransactionRow key={tx.id} tx={tx} ownWalletIds={ownIds} onOpen={setOpenTx} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={<ReceiptText className="size-6" aria-hidden />} title="No activity yet">
              Deposits, transfers and USD-X movements will show up here.
            </EmptyState>
          )}
        </Card>
      </div>

      <TransactionDrawer transactionId={openTx} onClose={() => setOpenTx(null)} />
    </>
  );
}
