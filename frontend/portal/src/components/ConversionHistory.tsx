import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, ArrowRight } from 'lucide-react';
import { apiErrorMessage, fxApi, type Transaction } from '@damp/web-shared/api';
import { formatDateTime, humanize } from '@damp/web-shared/lib';
import { Card, CardHeader, DataTable, LoadMore, MoneyText, StatusBadge } from '@damp/web-shared/ui';
import CurrencyIcon from './CurrencyIcon';
import TransactionDrawer from './TransactionDrawer';
import { useWallets } from '../hooks/useWallets';

const PAGE_SIZE = 25;

/** A conversion's two caller legs: money out (the debit) and money in (the credit). */
function conversionLegs(tx: Transaction, ownIds: ReadonlySet<string>) {
  const own = tx.entries.filter((e) => ownIds.has(e.accountId.split('.').pop() ?? ''));
  return {
    out: own.find((e) => e.direction.toUpperCase() === 'DEBIT'),
    into: own.find((e) => e.direction.toUpperCase() === 'CREDIT'),
  };
}

/** Full conversion history, newest first, paged by the ledger's cursor. */
export default function ConversionHistory() {
  const wallets = useWallets();
  const ownIds = useMemo(() => new Set(wallets.data?.map((w) => w.id) ?? []), [wallets.data]);
  const [items, setItems] = useState<Transaction[]>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [openTx, setOpenTx] = useState<string | null>(null);

  const load = useCallback((after?: string) => {
    setLoading(true);
    setError(undefined);
    fxApi.conversions({ cursor: after, limit: PAGE_SIZE }).then(
      (page) => {
        setItems((prev) => (after ? [...(prev ?? []), ...page.transactions] : page.transactions));
        setCursor(page.nextCursor || null);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => load(), [load]);

  return (
    <Card>
      <CardHeader title="Conversion history" description="Every swap and USD-X issue or redemption, newest first." />
      <DataTable
        caption="Conversion history"
        rows={items}
        loading={loading}
        error={error && !items?.length ? apiErrorMessage(error) : undefined}
        onRetry={() => load()}
        rowKey={(t) => t.id}
        onRowClick={(t) => setOpenTx(t.id)}
        empty={{ title: 'No conversions yet', body: 'Swaps and USD-X moves will appear here once you make one.', icon: <ArrowLeftRight className="size-6" aria-hidden /> }}
        columns={[
          { key: 'date', header: 'Date', render: (t) => <span className="whitespace-nowrap text-muted">{formatDateTime(t.valueDate || t.createdAt)}</span> },
          {
            key: 'pair',
            header: 'Conversion',
            render: (t) => {
              const { out, into } = conversionLegs(t, ownIds);
              if (!out || !into) return <span className="font-medium text-ink">{t.description || humanize(t.type)}</span>;
              return (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <CurrencyIcon currency={out.currency} size="sm" />
                  <span>{out.currency}</span>
                  <ArrowRight className="size-3.5 text-muted" aria-hidden />
                  <CurrencyIcon currency={into.currency} size="sm" />
                  <span>{into.currency}</span>
                </span>
              );
            },
          },
          { key: 'out', header: 'Amount out', align: 'right', render: (t) => { const { out } = conversionLegs(t, ownIds); return out ? <MoneyText money={out.amount} /> : '—'; } },
          { key: 'in', header: 'Amount in', align: 'right', render: (t) => { const { into } = conversionLegs(t, ownIds); return into ? <MoneyText money={into.amount} /> : '—'; } },
          // The booked rate comes from core-ledger's transaction metadata via
          // bff's `fx` field; older rows (and non-FX types) carry none.
          { key: 'rate', header: 'Rate', hideOnMobile: true, render: (t) => <span className={t.fx?.rate ? 'font-mono text-ink' : 'text-muted'}>{t.fx?.rate ?? '—'}</span> },
          { key: 'status', header: 'Status', hideOnMobile: true, render: (t) => <StatusBadge status={t.reversed ? 'REVERSED' : t.status} /> },
        ]}
      />
      {error && items?.length ? <p className="pt-3 text-center text-sm text-warn-ink">{apiErrorMessage(error)}</p> : null}
      <LoadMore hasMore={!!cursor} loading={loading} onClick={() => cursor && load(cursor)} />
      <TransactionDrawer transactionId={openTx} onClose={() => setOpenTx(null)} />
    </Card>
  );
}
