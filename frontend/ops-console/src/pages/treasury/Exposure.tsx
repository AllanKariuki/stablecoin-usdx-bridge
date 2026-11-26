import { useState } from 'react';
import { AlertTriangle, ArrowLeftRight, Check, Coins, Pencil } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { treasuryApi, type ExposureRow } from '@damp/web-shared/api/treasury';
import { Can } from '@damp/web-shared/auth';
import { cx, formatDateTime, timeAgo, useAsync } from '@damp/web-shared/lib';
import { AmountInput, Badge, Button, Callout, Card, CardHeader, DataTable, Field, Input, Modal, PageHeader, Segmented, Select } from '@damp/web-shared/ui';

const ASSETS = ['BTC', 'ETH', 'SOL'];
const FIAT = ['USD', 'EUR', 'GBP', 'KES'];

const positiveDecimal = (raw: string) => /^\d+(\.\d+)?$/.test(raw.trim()) && !/^0+(\.0+)?$/.test(raw.trim());
const short = (amount: string) => amount.startsWith('-');

function ReconBadge({ status }: { status: 'MATCH' | 'DRIFT' }) {
  return status === 'MATCH' ? (
    <Badge tone="cyan" icon={<Check className="size-3.5" aria-hidden />}>MATCH</Badge>
  ) : (
    <Badge tone="warn" icon={<AlertTriangle className="size-3.5" aria-hidden />}>DRIFT</Badge>
  );
}

function Utilisation({ bps }: { bps: number | null }) {
  if (bps === null) return <span className="text-subtle">—</span>;
  const pct = Math.min(bps / 100, 100);
  const over = bps > 10000;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-tint">
        <div className={cx('h-full rounded-full', over ? 'bg-danger' : 'bg-action')} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted">{(bps / 100).toFixed(1)}%</span>
    </div>
  );
}

/**
 * The treasury desk's crypto exposure: per custodial crypto currency, what
 * customers hold, what custody holds, the net the house runs, and the mandate
 * that bounds it — with the custodian's word and the rebalance trades beside.
 */
export default function Exposure() {
  const rows = useAsync(() => treasuryApi.exposure(), []);
  const rebalances = useAsync(() => treasuryApi.rebalances(), []);
  const [editing, setEditing] = useState<ExposureRow | null>(null);
  const [rebalancing, setRebalancing] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Treasury"
        title="Crypto exposure"
        description="The house's net position in custodial crypto, the mandate bounding it, and the custodian's word for the same holdings."
      />
      <div className="flex flex-col gap-5">
        <Card className="reveal">
          <CardHeader
            title="Exposure by asset"
            description="Net exposure is custody holdings minus customer liabilities — negative means the house is short."
            actions={
              <Can anyOf={['reserves:manage']}>
                <Button size="sm" variant="secondary" icon={<ArrowLeftRight className="size-3.5" aria-hidden />} onClick={() => setRebalancing(true)}>
                  Record rebalance
                </Button>
              </Can>
            }
          />
          <DataTable
            caption="Crypto exposure"
            rows={rows.data}
            loading={rows.loading}
            error={rows.error ? apiErrorMessage(rows.error) : undefined}
            onRetry={rows.reload}
            rowKey={(r) => r.currency}
            empty={{ icon: <Coins className="size-6" aria-hidden />, title: 'No custodial crypto positions', body: 'Exposure appears once the ledger reports a BTC/ETH/SOL position.' }}
            columns={[
              { key: 'asset', header: 'Asset', render: (r) => <span className="font-bold text-navy">{r.currency}</span> },
              { key: 'liabilities', header: 'Customer liabilities', align: 'right', render: (r) => <span className="font-mono tabular-nums">{r.customerLiabilities}</span> },
              { key: 'holdings', header: 'Custody holdings', align: 'right', render: (r) => <span className="font-mono tabular-nums">{r.custodyHoldings}</span> },
              {
                key: 'net',
                header: 'Net exposure',
                align: 'right',
                render: (r) => <span className={cx('font-mono font-semibold tabular-nums', short(r.netExposure) ? 'text-danger-ink' : 'text-ink')}>{r.netExposure}</span>,
              },
              {
                key: 'mandate',
                header: 'Mandate',
                render: (r) => (r.limits ? <span className="font-mono text-[12.5px]">[-{r.limits.maxShort}, +{r.limits.maxLong}]</span> : <span className="text-subtle">None</span>),
              },
              { key: 'utilisation', header: 'Utilisation', render: (r) => <Utilisation bps={r.utilisationBps} /> },
              {
                key: 'recon',
                header: 'Custodian recon',
                align: 'right',
                render: (r) =>
                  r.recon ? (
                    <span className="flex flex-col items-end gap-0.5">
                      <ReconBadge status={r.recon.status} />
                      <span className="text-xs text-muted" title={r.custodianSnapshot ? formatDateTime(r.custodianSnapshot.asOf) : undefined}>
                        {r.custodianSnapshot ? timeAgo(r.custodianSnapshot.asOf) : '—'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-subtle">—</span>
                  ),
              },
              {
                key: 'edit',
                header: <span className="sr-only">Edit</span>,
                align: 'right',
                render: (r) => (
                  <Can anyOf={['reserves:manage']}>
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" aria-hidden />} onClick={() => setEditing(r)} aria-label={`Edit ${r.currency} mandate`}>
                      Edit mandate
                    </Button>
                  </Can>
                ),
              },
            ]}
          />
        </Card>

        <Card className="reveal">
          <CardHeader title="Rebalances" description="Trades the desk has posted, each with the journal entry it produced in the ledger." />
          <DataTable
            caption="Rebalance history"
            rows={rebalances.data}
            loading={rebalances.loading}
            error={rebalances.error ? apiErrorMessage(rebalances.error) : undefined}
            onRetry={rebalances.reload}
            rowKey={(r) => r.id}
            empty={{ icon: <ArrowLeftRight className="size-6" aria-hidden />, title: 'No rebalances yet' }}
            columns={[
              { key: 'created', header: 'Posted', render: (r) => <span title={formatDateTime(r.created_at)}>{timeAgo(r.created_at)}</span> },
              { key: 'side', header: 'Side', render: (r) => <Badge tone={r.side === 'BUY' ? 'cyan' : 'warn'}>{r.side}</Badge> },
              { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="font-mono tabular-nums">{r.amount} {r.currency}</span> },
              { key: 'fiat', header: 'Fiat leg', align: 'right', render: (r) => <span className="font-mono tabular-nums">{r.fiat_amount} {r.fiat_currency}</span> },
              { key: 'ref', header: 'Custodian ref', render: (r) => <span className="font-mono text-[12.5px]">{r.custodian_ref || '—'}</span>, hideOnMobile: true },
              { key: 'note', header: 'Note', render: (r) => <span className="text-[13px] text-muted">{r.note || '—'}</span>, hideOnMobile: true },
              { key: 'by', header: 'By', render: (r) => r.created_by, hideOnMobile: true },
            ]}
          />
        </Card>
      </div>

      {editing && <MandateModal row={editing} onClose={() => setEditing(null)} onSaved={rows.reload} />}
      {rebalancing && <RebalanceModal onClose={() => setRebalancing(false)} onSaved={() => (rows.reload(), rebalances.reload())} />}
    </>
  );
}

function MandateModal({ row, onClose, onSaved }: { row: ExposureRow; onClose: () => void; onSaved: () => void }) {
  const [maxShort, setMaxShort] = useState(row.limits?.maxShort ?? '');
  const [maxLong, setMaxLong] = useState(row.limits?.maxLong ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!/^\d+(\.\d+)?$/.test(maxShort.trim())) return setError('Maximum short is a non-negative decimal amount.');
    if (!/^\d+(\.\d+)?$/.test(maxLong.trim())) return setError('Maximum long is a non-negative decimal amount.');
    setBusy(true);
    setError(null);
    try {
      await treasuryApi.setLimit(row.currency, { max_short: maxShort.trim(), max_long: maxLong.trim() });
      onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={`Edit ${row.currency} mandate`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button loading={busy} onClick={save}>Save mandate</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Maximum short" hint="How short the house may run this currency, as a decimal amount.">
          <AmountInput currency={row.currency} value={maxShort} onChange={(e) => setMaxShort(e.target.value)} className="font-mono" />
        </Field>
        <Field label="Maximum long" hint="How long the house may run this currency, as a decimal amount.">
          <AmountInput currency={row.currency} value={maxLong} onChange={(e) => setMaxLong(e.target.value)} className="font-mono" />
        </Field>
        <Callout tone="warn" title="What this does">
          Changes what “inside the mandate” means for {row.currency} from now on. The previous value is kept in the audit trail.
        </Callout>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}

function RebalanceModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [asset, setAsset] = useState('BTC');
  const [amount, setAmount] = useState('');
  const [fiatCcy, setFiatCcy] = useState('USD');
  const [fiatAmount, setFiatAmount] = useState('');
  const [custodianRef, setCustodianRef] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!positiveDecimal(amount)) return setError('Amount is a positive decimal amount of the asset.');
    if (!positiveDecimal(fiatAmount)) return setError('Fiat amount is a positive decimal amount.');
    setBusy(true);
    setError(null);
    try {
      await treasuryApi.postRebalance({
        side,
        currency: asset,
        amount: amount.trim(),
        fiat_currency: fiatCcy,
        fiat_amount: fiatAmount.trim(),
        custodian_ref: custodianRef.trim() || undefined,
        note: note.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title="Record a rebalance"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button loading={busy} onClick={submit}>Post rebalance</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Side">
          <Segmented
            label="Side"
            value={side}
            onChange={setSide}
            options={[
              { value: 'BUY', label: 'Buy crypto' },
              { value: 'SELL', label: 'Sell crypto' },
            ]}
          />
        </Field>
        <Field label="Asset">
          <Select value={asset} onChange={(e) => setAsset(e.target.value)}>
            {ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </Field>
        <Field label="Amount" hint="How much of the asset the trade moves.">
          <AmountInput currency={asset} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Fiat currency">
          <Select value={fiatCcy} onChange={(e) => setFiatCcy(e.target.value)}>
            {FIAT.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Fiat amount" hint="The fiat leg of the trade.">
          <AmountInput currency={fiatCcy} value={fiatAmount} onChange={(e) => setFiatAmount(e.target.value)} />
        </Field>
        <Field label="Custodian reference" optional>
          <Input value={custodianRef} onChange={(e) => setCustodianRef(e.target.value)} />
        </Field>
        <Field label="Note" optional>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Callout tone="warn" title="What this does">
          Posts the journal entry for this trade to the ledger under a deterministic idempotency key. A retry replays the same entry, never double-trades.
        </Callout>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}
