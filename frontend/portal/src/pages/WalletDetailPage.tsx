import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Pencil, ReceiptText, Star } from 'lucide-react';
import { apiErrorMessage, apiStatus, ledgerApi, walletsApi } from '@damp/web-shared/api';
import { Can } from '@damp/web-shared/auth';
import { formatDate, humanize, useAsync } from '@damp/web-shared/lib';
import { NotFoundPage } from '@damp/web-shared/pages';
import { Button, Callout, Card, CardHeader, DataTable, ErrorState, Field, HeroPanel, Input, KeyValueList, LinkButton, Modal, MonoRef, MoneyText, PageHeader, Skeleton, StatusBadge, toast } from '@damp/web-shared/ui';
import TransactionDrawer from '../components/TransactionDrawer';
import SignedAmount from '../components/SignedAmount';
import { isFrozen } from '../hooks/useWallets';

/** Label rename — the same 64-character cap the backend enforces. */
function RenameWallet({ walletId, label, onRenamed }: { walletId: string; label: string; onRenamed: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (value.length > 64) return setError('Keep the label to 64 characters or fewer.');
    setBusy(true);
    setError(null);
    try {
      await walletsApi.updateWallet(walletId, { label: value.trim() || undefined });
      onRenamed();
      setOpen(false);
      toast('Wallet renamed.');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="secondary" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => (setValue(label), setOpen(true))}>
        Rename
      </Button>
      <Modal
        open={open}
        onClose={busy ? () => undefined : () => setOpen(false)}
        title="Rename wallet"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="detail-rename-form" loading={busy}>
              Save
            </Button>
          </>
        }
      >
        <form id="detail-rename-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label="Label" hint="Up to 64 characters." error={error ?? undefined}>
            <Input value={value} onChange={(e) => (setValue(e.target.value), setError(null))} autoFocus />
          </Field>
        </form>
      </Modal>
    </>
  );
}

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
        title={
          <span className="flex items-center gap-2">
            {w ? `${w.label || w.currency} · ${w.currency}` : <Skeleton className="h-8 w-56" />}
            {w?.isDefault && <Star className="size-5 fill-warn text-warn" aria-label="Default wallet" />}
          </span>
        }
        actions={
          w ? (
            <Can anyOf={['wallets:write:own']}>
              {!isFrozen(w) && (
                <>
                  <LinkButton to={`/convert?from=${w.id}`} variant="secondary" icon={<ArrowLeftRight className="size-4" aria-hidden />}>Convert</LinkButton>
                  <LinkButton to="/move/deposit" variant="secondary" icon={<ArrowDownToLine className="size-4" aria-hidden />}>Deposit</LinkButton>
                  <LinkButton to="/move/withdraw" variant="secondary" icon={<ArrowUpFromLine className="size-4" aria-hidden />}>Withdraw</LinkButton>
                </>
              )}
              <RenameWallet walletId={w.id} label={w.label} onRenamed={wallet.reload} />
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
            <HeroPanel className="p-5 sm:p-6">
              <p className="text-[13px] text-on-navy-muted">Available balance</p>
              {w ? <MoneyText money={w.balance} size="xl" className="mt-2 text-white" /> : <Skeleton className="mt-2 h-8 w-40" />}
            </HeroPanel>
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
                    { label: 'Default', value: w.isDefault ? 'Yes — the one payments prefer in this currency' : 'No' },
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
