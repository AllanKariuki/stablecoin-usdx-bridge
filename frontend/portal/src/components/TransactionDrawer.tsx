import { ledgerApi, primaryEntryFor, type Transaction } from '@damp/web-shared/api';
import { formatDateTime, humanize, useAsync } from '@damp/web-shared/lib';
import { Callout, DataTable, Drawer, ErrorState, KeyValueList, MonoRef, MoneyText, SkeletonRows, StatusBadge } from '@damp/web-shared/ui';
import { apiErrorMessage } from '@damp/web-shared/api';
import SignedAmount from './SignedAmount';

/**
 * A ledger transaction with all its legs. Double-entry means there is no
 * single amount — every account touched is shown, debits and credits apart.
 */
export default function TransactionDrawer({ transactionId, onClose }: { transactionId: string | null; onClose: () => void }) {
  const tx = useAsync(() => (transactionId ? ledgerApi.transaction(transactionId) : Promise.resolve(undefined)), [transactionId]);
  return (
    <Drawer open={transactionId !== null} onClose={onClose} title="Transaction">
      {tx.loading ? (
        <SkeletonRows rows={4} />
      ) : tx.error ? (
        <ErrorState message={apiErrorMessage(tx.error)} onRetry={tx.reload} />
      ) : tx.data ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={tx.data.status} />
            {tx.data.reversed && <StatusBadge status="REVERSED" />}
            <span className="text-sm font-semibold text-ink">{humanize(tx.data.type)}</span>
          </div>
          {tx.data.reversed && <Callout tone="warn">This transaction was reversed by a later contra-entry. Both stay on the ledger.</Callout>}
          <KeyValueList
            items={[
              { label: 'Reference', value: <MonoRef value={tx.data.id} /> },
              { label: 'Description', value: tx.data.description || '—' },
              { label: 'Value date', value: formatDateTime(tx.data.valueDate) },
              { label: 'Recorded', value: formatDateTime(tx.data.createdAt) },
              ...(tx.data.externalRef ? [{ label: 'External reference', value: <MonoRef value={tx.data.externalRef} /> }] : []),
            ]}
          />
          <div>
            <h3 className="eyebrow mb-2">Ledger entries</h3>
            <DataTable
              rows={tx.data.entries}
              rowKey={(e) => String(e.lineNo)}
              columns={[
                { key: 'account', header: 'Account', render: (e) => <MonoRef value={e.accountId} /> },
                { key: 'dir', header: 'Side', render: (e) => <span className="text-xs font-semibold text-muted">{humanize(e.direction)}</span> },
                { key: 'amt', header: 'Amount', align: 'right', render: (e) => <MoneyText money={e.amount} /> },
              ]}
            />
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

/** One row of a "recent activity" list: description, date, the viewer's leg. */
export function TransactionRow({ tx, ownWalletIds, onOpen }: { tx: Transaction; ownWalletIds: ReadonlySet<string>; onOpen: (id: string) => void }) {
  const leg = primaryEntryFor(tx, ownWalletIds);
  return (
    <li>
      <button type="button" onClick={() => onOpen(tx.id)} className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-2 py-2.5 text-left hover:bg-canvas">
        <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-neutral-tint text-[11px] font-bold text-neutral-ink">{tx.type.slice(0, 3).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{tx.description || humanize(tx.type)}</span>
          <span className="block text-xs text-muted">{formatDateTime(tx.valueDate || tx.createdAt)}</span>
        </span>
        {leg && <SignedAmount money={leg.amount} direction={leg.direction} />}
      </button>
    </li>
  );
}
