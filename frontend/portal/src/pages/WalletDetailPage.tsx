import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, ReceiptText } from 'lucide-react';
import { apiErrorMessage, apiStatus, ledgerApi } from '@damp/web-shared/api';
import { Can } from '@damp/web-shared/auth';
import { formatDate, humanize, useAsync } from '@damp/web-shared/lib';
import { NotFoundPage } from '@damp/web-shared/pages';
import { Button, Callout, Card, CardHeader, DataTable, ErrorState, Field, Input, KeyValueList, LinkButton, MonoRef, MoneyText, PageHeader, Skeleton, StatusBadge } from '@damp/web-shared/ui';
import TransactionDrawer from '../components/TransactionDrawer';
import SignedAmount from '../components/SignedAmount';
import { isFrozen } from '../hooks/useWallets';

export default function WalletDetailPage() {
  const { walletId = '' } = useParams();
  const wallet = useAsync(() => ledgerApi.wallet(walletId), [walletId]);
  const [range, setRange] = useState({ from: '', to: '' });
  const [applied, setApplied] = useState({ from: '', to: '' });
  const statement = useAsync(() => ledgerApi.statement(walletId, { from: applied.from || undefined, to: applied.to || undefined, limit: 100 }), [walletId, applied.from, applied.to]);
  const [openTx, setOpenTx] = useState<string | null>(null);

  if (wallet.error && apiStatus(wallet.error) === 404) return <NotFoundPage />;
  const w = wallet.data;

  return (
    <>
      <PageHeader
        eyebrow="Wallet"
        title={w ? `${w.label || w.currency} · ${w.currency}` : <Skeleton className="h-8 w-56" />}
        actions={
          w && !isFrozen(w) ? (
            <Can anyOf={['wallets:write:own']}>
              <LinkButton to="/move/deposit" variant="secondary" icon={<ArrowDownToLine className="size-4" aria-hidden />}>Deposit</LinkButton>
              <LinkButton to="/move/withdraw" variant="secondary" icon={<ArrowUpFromLine className="size-4" aria-hidden />}>Withdraw</LinkButton>
            </Can>
          ) : undefined
        }
      />

      {wallet.error ? (
        <Card>
          <ErrorState message={apiErrorMessage(wallet.error)} onRetry={wallet.reload} />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
          <div className="flex flex-col gap-4">
            <Card className="bg-navy text-white" padded>
              <p className="text-[13px] text-on-navy-muted">Available balance</p>
              {w ? <MoneyText money={w.balance} size="xl" className="mt-2 text-white" /> : <Skeleton className="mt-2 h-8 w-40" />}
            </Card>
            {w && isFrozen(w) && (
              <Callout tone="warn" title="This wallet is frozen">
                Money can’t move in or out while it’s frozen. This usually means our compliance team needs to check something. Contact support and quote the wallet reference below.
              </Callout>
            )}
            <Card>
              <CardHeader title="Details" />
              {w ? (
                <KeyValueList
                  items={[
                    { label: 'Status', value: <StatusBadge status={w.status} /> },
                    { label: 'Currency', value: w.currency },
                    ...(w.chain ? [{ label: 'Chain', value: humanize(w.chain) }] : []),
                    ...(w.address ? [{ label: 'Address', value: <MonoRef value={w.address} /> }] : []),
                    { label: 'Wallet reference', value: <MonoRef value={w.id} /> },
                  ]}
                />
              ) : (
                <Skeleton className="h-24" />
              )}
            </Card>
          </div>

          <Card>
            <CardHeader title="Statement" description="Every posting to this wallet, with the balance after it." />
            <form
              className="mb-4 flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                setApplied(range);
              }}
            >
              <Field label="From" className="w-40">
                <Input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
              </Field>
              <Field label="To" className="w-40">
                <Input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
              </Field>
              <Button type="submit" variant="secondary">Apply</Button>
              {(applied.from || applied.to) && (
                <Button variant="ghost" onClick={() => (setRange({ from: '', to: '' }), setApplied({ from: '', to: '' }))}>
                  Clear
                </Button>
              )}
            </form>
            <DataTable
              caption="Wallet statement"
              rows={statement.data?.entries}
              loading={statement.loading}
              error={statement.error ? apiErrorMessage(statement.error) : undefined}
              onRetry={statement.reload}
              rowKey={(e) => `${e.seq}`}
              onRowClick={(e) => setOpenTx(e.transactionId)}
              empty={{ title: 'Nothing in this period', body: 'Try a wider date range.', icon: <ReceiptText className="size-6" aria-hidden /> }}
              columns={[
                { key: 'date', header: 'Date', render: (e) => <span className="whitespace-nowrap text-muted">{formatDate(e.valueDate)}</span> },
                { key: 'desc', header: 'Description', render: (e) => <span className="font-medium text-ink">{e.description || humanize(e.direction)}</span> },
                { key: 'amount', header: 'Amount', align: 'right', render: (e) => <SignedAmount money={e.amount} direction={e.direction} /> },
                { key: 'bal', header: 'Balance', align: 'right', hideOnMobile: true, render: (e) => <MoneyText money={e.runningBalance} className="text-muted" /> },
              ]}
            />
          </Card>
        </div>
      )}
      <TransactionDrawer transactionId={openTx} onClose={() => setOpenTx(null)} />
    </>
  );
}
