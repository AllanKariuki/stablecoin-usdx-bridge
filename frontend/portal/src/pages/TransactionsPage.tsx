import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { apiErrorMessage, ledgerApi, primaryEntryFor, type Transaction } from '@damp/web-shared/api';
import { formatDateTime, humanize } from '@damp/web-shared/lib';
import { Card, DataTable, LoadMore, PageHeader, StatusBadge } from '@damp/web-shared/ui';
import TransactionDrawer from '../components/TransactionDrawer';
import SignedAmount from '../components/SignedAmount';
import { useWallets } from '../hooks/useWallets';

/** Full history, newest first, paged by the ledger's cursor (never by offset). */
export default function TransactionsPage() {
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
    ledgerApi.transactions({ cursor: after, limit: 25 }).then(
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
    <>
      <PageHeader eyebrow="History" title="Transactions" description="Every posting across your wallets. Open one to see each ledger entry." />
      <Card>
        <DataTable
          caption="Transactions"
          rows={items}
          loading={loading}
          error={error && !items?.length ? apiErrorMessage(error) : undefined}
          onRetry={() => load()}
          rowKey={(t) => t.id}
          onRowClick={(t) => setOpenTx(t.id)}
          empty={{ title: 'No transactions yet', body: 'Deposits, transfers and USD-X movements will appear here.', icon: <ReceiptText className="size-6" aria-hidden /> }}
          columns={[
            { key: 'date', header: 'Date', render: (t) => <span className="whitespace-nowrap text-muted">{formatDateTime(t.valueDate || t.createdAt)}</span> },
            { key: 'desc', header: 'Description', render: (t) => <span className="font-medium text-ink">{t.description || humanize(t.type)}</span> },
            { key: 'type', header: 'Type', hideOnMobile: true, render: (t) => <span className="text-muted">{humanize(t.type)}</span> },
            { key: 'status', header: 'Status', hideOnMobile: true, render: (t) => <StatusBadge status={t.reversed ? 'REVERSED' : t.status} /> },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              render: (t) => {
                const leg = primaryEntryFor(t, ownIds);
                return leg ? <SignedAmount money={leg.amount} direction={leg.direction} /> : '—';
              },
            },
          ]}
        />
        {error && items?.length ? <p className="pt-3 text-center text-sm text-warn-ink">{apiErrorMessage(error)}</p> : null}
        <LoadMore hasMore={!!cursor} loading={loading} onClick={() => cursor && load(cursor)} />
      </Card>
      <TransactionDrawer transactionId={openTx} onClose={() => setOpenTx(null)} />
    </>
  );
}
