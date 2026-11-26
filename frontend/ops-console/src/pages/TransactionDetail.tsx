import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Undo2 } from 'lucide-react';
import { apiErrorMessage, ledgerApi, type TransactionEntry } from '@damp/web-shared/api';
import { ledgerAdminApi } from '@damp/web-shared/api/ledger-admin';
import { Can } from '@damp/web-shared/auth';
import { formatDateTime, humanize, useAsync } from '@damp/web-shared/lib';
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
  type Column,
} from '@damp/web-shared/ui';
import { BackLink, DetailGrid } from '../components/Detail';
import { rememberRecent } from '../recent';

const flip = (direction: string) => (direction.toUpperCase().startsWith('D') ? 'CREDIT' : 'DEBIT');

const walletIdOf = (accountId: string) => accountId.split('.').pop() ?? accountId;

export default function TransactionDetail() {
  const { transactionId = '' } = useParams();
  const tx = useAsync(() => ledgerApi.transaction(transactionId), [transactionId]);
  const [confirm, setConfirm] = useState(false);
  const [reversalId, setReversalId] = useState<string | null>(null);

  useEffect(() => {
    if (tx.data) rememberRecent('transaction', transactionId);
  }, [tx.data, transactionId]);

  if (tx.error) {
    return (
      <>
        <BackLink to="/transactions">Transactions</BackLink>
        <ErrorState title="This transaction didn't load" message={apiErrorMessage(tx.error)} onRetry={tx.reload} />
      </>
    );
  }

  const t = tx.data;
  const entryColumns = (preview = false): Column<TransactionEntry>[] => [
    { key: 'line', header: '#', render: (e) => <span className="font-mono text-[12.5px] text-subtle">{e.lineNo}</span> },
    {
      key: 'account',
      header: 'Account',
      render: (e) =>
        e.accountId.startsWith('2100.') ? (
          <Link to={`/wallets/${encodeURIComponent(walletIdOf(e.accountId))}`} className="font-mono text-[12.5px] text-action no-underline hover:underline">
            {e.accountId}
          </Link>
        ) : (
          <span className="font-mono text-[12.5px] text-navy">{e.accountId}</span>
        ),
    },
    { key: 'dir', header: 'Side', render: (e) => <span className="text-[13px] font-semibold">{humanize(preview ? flip(e.direction) : e.direction)}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: (e) => <MoneyText money={e.amount} /> },
    ...(preview ? [] : [{ key: 'bal', header: 'Balance after', align: 'right' as const, render: (e: TransactionEntry) => <MoneyText money={e.runningBalance} className="text-neutral-ink" />, hideOnMobile: true }]),
  ];

  return (
    <>
      <BackLink to="/transactions">Transactions</BackLink>
      <PageHeader
        eyebrow={t ? humanize(t.type) : 'Transaction'}
        title={t ? t.description || humanize(t.type) : <Skeleton className="h-8 w-64" />}
        description={t && <MonoRef value={t.id} truncate={false} />}
        actions={
          t &&
          !t.reversed && (
            <Can anyOf={['transactions:reverse']}>
              <Button variant="warn" icon={<Undo2 className="size-4" aria-hidden />} onClick={() => setConfirm(true)}>
                Reverse…
              </Button>
            </Can>
          )
        }
      />

      {t?.reversed && (
        <Callout tone="warn" title="This transaction has been reversed" className="mb-5">
          A contra-entry was posted against it. The original entries below are unchanged — the ledger is append-only.
        </Callout>
      )}
      {reversalId && (
        <Callout tone="success" title="Reversal posted" className="mb-5">
          Contra-entry <Link to={`/transactions/${encodeURIComponent(reversalId)}`}>{reversalId}</Link> was posted.
        </Callout>
      )}

      <DetailGrid
        main={
          <Card>
            <CardHeader title="Ledger entries" description="Double-entry: debits and credits balance per currency." />
            <DataTable caption="Ledger entries" rows={t?.entries} loading={tx.loading} rowKey={(e) => `${e.lineNo}`} columns={entryColumns()} />
          </Card>
        }
        side={
          <Card className="reveal">
            <CardHeader title="Details" />
            {!t ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <KeyValueList
                items={[
                  { label: 'Status', value: <StatusBadge status={t.reversed ? 'REVERSED' : t.status} /> },
                  { label: 'Type', value: humanize(t.type) },
                  { label: 'Value date', value: formatDateTime(t.valueDate) },
                  { label: 'Created', value: formatDateTime(t.createdAt) },
                  { label: 'External ref', value: <MonoRef value={t.externalRef} /> },
                ]}
              />
            )}
          </Card>
        }
      />

      {t && (
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          title="Reverse this transaction?"
          variant="warn"
          confirmLabel="Post reversal"
          requireReason
          reasonLabel="Why is this being reversed?"
          consequence={
            <>
              This posts a <strong>new</strong> transaction with every entry below on the opposite side. Nothing is edited or deleted: the
              original stays in the ledger, marked reversed, and both appear on the affected statements.
            </>
          }
          onConfirm={async (reason) => {
            try {
              const rev = await ledgerAdminApi.reverse(t.id, reason);
              setReversalId(rev.id);
              tx.reload();
            } catch (err) {
              throw new Error(apiErrorMessage(err));
            }
          }}
        >
          <div>
            <p className="eyebrow mb-2 text-[11px]">Contra-entry preview</p>
            <DataTable caption="Reversal preview" rows={t.entries} rowKey={(e) => `${e.lineNo}`} columns={entryColumns(true)} />
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
