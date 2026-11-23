import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Snowflake, Sun } from 'lucide-react';
import { apiErrorMessage, ledgerApi, type Wallet } from '@damp/web-shared/api';
import { Can } from '@damp/web-shared/auth';
import { formatDate, useAsync } from '@damp/web-shared/lib';
import {
  Button,
  Callout,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  ErrorState,
  KeyValueList,
  MonoRef,
  MoneyText,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '@damp/web-shared/ui';
import { BackLink, DetailGrid } from '../components/Detail';
import { rememberRecent } from '../recent';

export default function WalletDetail() {
  const { walletId = '' } = useParams();
  const wallet = useAsync(() => ledgerApi.wallet(walletId), [walletId]);
  const statement = useAsync(() => ledgerApi.statement(walletId, { limit: 100 }), [walletId]);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (wallet.data) rememberRecent('wallet', walletId);
  }, [wallet.data, walletId]);

  if (wallet.error) {
    return (
      <>
        <BackLink to="/wallets">Wallets</BackLink>
        <ErrorState title="This wallet didn't load" message={apiErrorMessage(wallet.error)} onRetry={wallet.reload} />
      </>
    );
  }

  const w = wallet.data;
  const frozen = w?.status?.toUpperCase() === 'FROZEN';

  return (
    <>
      <BackLink to="/wallets">Wallets</BackLink>
      <PageHeader
        eyebrow="Wallet"
        title={w ? `${w.label || w.currency} wallet` : <Skeleton className="h-8 w-56" />}
        description={w && <MonoRef value={w.id} truncate={false} />}
        actions={
          w && (
            <Can anyOf={['wallets:status:manage']}>
              {frozen ? (
                <Button variant="secondary" icon={<Sun className="size-4" aria-hidden />} onClick={() => setConfirm(true)}>
                  Unfreeze wallet
                </Button>
              ) : (
                <Button variant="warn" icon={<Snowflake className="size-4" aria-hidden />} onClick={() => setConfirm(true)}>
                  Freeze wallet
                </Button>
              )}
            </Can>
          )
        }
      />

      {frozen && (
        <Callout tone="warn" title="This wallet is frozen" className="mb-5">
          No new postings can land on it. Existing balance and history are unchanged.
        </Callout>
      )}

      <DetailGrid
        main={
          <Card>
            <CardHeader title="Statement" description="Newest entries last, with the running balance after each." />
            <DataTable
              caption="Wallet statement"
              rows={statement.data?.entries}
              loading={statement.loading}
              error={statement.error ? apiErrorMessage(statement.error) : undefined}
              onRetry={statement.reload}
              rowKey={(e) => `${e.seq}`}
              empty={{ title: 'No entries yet', body: 'Nothing has been posted to this wallet.' }}
              columns={[
                { key: 'date', header: 'Value date', render: (e) => formatDate(e.valueDate) },
                { key: 'desc', header: 'Description', render: (e) => <span className="text-ink">{e.description || '—'}</span>, hideOnMobile: true },
                {
                  key: 'tx',
                  header: 'Transaction',
                  render: (e) => (
                    <Link to={`/transactions/${encodeURIComponent(e.transactionId)}`} className="font-mono text-[12.5px] text-action no-underline hover:underline">
                      {e.transactionId.slice(0, 10)}…
                    </Link>
                  ),
                  hideOnMobile: true,
                },
                { key: 'amount', header: 'Amount', align: 'right', render: (e) => <MoneyText money={e.amount} signed /> },
                { key: 'bal', header: 'Balance', align: 'right', render: (e) => <MoneyText money={e.runningBalance} className="text-neutral-ink" /> },
              ]}
            />
          </Card>
        }
        side={<WalletSummary wallet={w} />}
      />

      {w && (
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          title={frozen ? 'Unfreeze this wallet?' : 'Freeze this wallet?'}
          variant={frozen ? 'primary' : 'warn'}
          confirmLabel={frozen ? 'Unfreeze' : 'Freeze wallet'}
          consequence={
            frozen
              ? 'Postings to this wallet resume immediately: the owner can deposit, withdraw and transfer again.'
              : 'Every new posting to this wallet is refused until it is unfrozen, including incoming transfers. The balance is not moved or reduced. The change is recorded against your account.'
          }
          onConfirm={async () => {
            try {
              const next = await ledgerApi.setWalletStatus(w.id, frozen ? 'ACTIVE' : 'FROZEN');
              wallet.setData(next);
            } catch (err) {
              throw new Error(apiErrorMessage(err));
            }
          }}
        >
          <KeyValueList
            items={[
              { label: 'Wallet', value: w.id, mono: true },
              { label: 'Owner', value: w.userId, mono: true },
              { label: 'Balance', value: <MoneyText money={w.balance} /> },
            ]}
          />
        </ConfirmDialog>
      )}
    </>
  );
}

function WalletSummary({ wallet }: { wallet: Wallet | undefined }) {
  return (
    <Card className="reveal">
      <CardHeader title="Summary" />
      {!wallet ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        <>
          <p className="eyebrow text-[11px]">Balance</p>
          <MoneyText money={wallet.balance} size="xl" className="mt-1 mb-4 text-navy" />
          <KeyValueList
            items={[
              { label: 'Status', value: <StatusBadge status={wallet.status} /> },
              { label: 'Currency', value: wallet.currency },
              { label: 'Chain', value: wallet.chain || 'Off-chain (fiat)' },
              { label: 'Owner', value: <MonoRef value={wallet.userId} /> },
              ...(wallet.address ? [{ label: 'Address', value: <MonoRef value={wallet.address} /> }] : []),
            ]}
          />
        </>
      )}
    </Card>
  );
}
