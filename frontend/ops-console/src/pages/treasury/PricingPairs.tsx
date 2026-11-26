import { useState } from 'react';
import { AlertTriangle, Check, Clock, Pencil, SlidersHorizontal } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { pricingApi, type PriceStatus, type PricingPair } from '@damp/web-shared/api/pricing';
import { Can } from '@damp/web-shared/auth';
import { formatDateTime, timeAgo, useAsync } from '@damp/web-shared/lib';
import { AmountInput, Badge, Button, Callout, Card, CardHeader, Checkbox, DataTable, Drawer, Field, Input, PageHeader } from '@damp/web-shared/ui';

function RateStatus({ status }: { status: PriceStatus }) {
  if (status === 'OK') return <Badge tone="cyan" icon={<Check className="size-3.5" aria-hidden />}>OK</Badge>;
  if (status === 'STALE') return <Badge tone="warn" icon={<Clock className="size-3.5" aria-hidden />}>STALE</Badge>;
  return <Badge tone="danger" icon={<AlertTriangle className="size-3.5" aria-hidden />}>TRIPPED</Badge>;
}

/**
 * The pair policy and indicative rates the quote path stands behind: what
 * pairs quote, how wide the spread, and the same aggregated mids a quote
 * would mint — so a console can see "TRIPPED" before a quote request
 * explains it the hard way.
 */
export default function PricingPairs() {
  const rates = useAsync(() => pricingApi.rates('USD'), []);
  const pairs = useAsync(() => pricingApi.pairs(), []);
  const [editing, setEditing] = useState<PricingPair | null>(null);

  return (
    <>
      <PageHeader
        eyebrow="Treasury"
        title="Pricing"
        description="Indicative rates and the per-pair policy (spread, TTL, notional cap) the quote path enforces."
      />
      <div className="flex flex-col gap-5">
        <Card className="reveal">
          <CardHeader title="Indicative rates" description={`Aggregated mids against ${rates.data?.base ?? 'USD'}, with the same status the quote path refuses on.`} />
          <DataTable
            caption="Indicative rates"
            rows={rates.data?.entries}
            loading={rates.loading}
            error={rates.error ? apiErrorMessage(rates.error) : undefined}
            onRetry={rates.reload}
            rowKey={(e) => e.currency}
            empty={{ icon: <SlidersHorizontal className="size-6" aria-hidden />, title: 'No rates yet', body: 'Rates appear once the price feeds report their first observations.' }}
            columns={[
              { key: 'ccy', header: 'Currency', render: (e) => <span className="font-bold text-navy">{e.currency}</span> },
              { key: 'rate', header: 'Rate', align: 'right', render: (e) => <span className="font-mono tabular-nums">{e.rate ?? '—'}</span> },
              { key: 'status', header: 'Status', align: 'right', render: (e) => <RateStatus status={e.status} /> },
              { key: 'sources', header: 'Sources', render: (e) => <span className="text-[13px] text-muted">{e.sources.length ? e.sources.join(', ') : '—'}</span>, hideOnMobile: true },
              { key: 'at', header: 'As of', align: 'right', render: (e) => <span title={e.at ? formatDateTime(e.at) : undefined}>{e.at ? timeAgo(e.at) : '—'}</span>, hideOnMobile: true },
            ]}
          />
        </Card>

        <Card className="reveal">
          <CardHeader title="Pairs" description="Direction matters — a spread-bearing rate is never inverted, so USD/KES and KES/USD are two policies." />
          <DataTable
            caption="Pricing pairs"
            rows={pairs.data}
            loading={pairs.loading}
            error={pairs.error ? apiErrorMessage(pairs.error) : undefined}
            onRetry={pairs.reload}
            rowKey={(p) => `${p.baseCcy}/${p.quoteCcy}`}
            empty={{ icon: <SlidersHorizontal className="size-6" aria-hidden />, title: 'No pairs configured' }}
            columns={[
              { key: 'pair', header: 'Pair', render: (p) => <span className="font-mono font-semibold text-navy">{p.baseCcy}/{p.quoteCcy}</span> },
              { key: 'spread', header: 'Spread', align: 'right', render: (p) => <span className="tabular-nums">{p.spreadBps} bps</span> },
              { key: 'ttl', header: 'TTL', align: 'right', render: (p) => <span className="tabular-nums">{p.ttlSeconds}s</span> },
              { key: 'notional', header: 'Max notional', align: 'right', render: (p) => <span className="font-mono tabular-nums">{p.maxNotionalUsd} USD</span> },
              {
                key: 'enabled',
                header: 'Enabled',
                align: 'right',
                render: (p) => (p.enabled ? <Badge tone="cyan" icon={<Check className="size-3.5" aria-hidden />}>Yes</Badge> : <Badge tone="neutral">No</Badge>),
              },
              {
                key: 'edit',
                header: <span className="sr-only">Edit</span>,
                align: 'right',
                render: (p) => (
                  <Can anyOf={['reserves:manage']}>
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" aria-hidden />} onClick={() => setEditing(p)} aria-label={`Edit ${p.baseCcy}/${p.quoteCcy}`}>
                      Edit
                    </Button>
                  </Can>
                ),
              },
            ]}
          />
        </Card>
      </div>

      {editing && <PairEditDrawer pair={editing} onClose={() => setEditing(null)} onSaved={pairs.reload} />}
    </>
  );
}

function PairEditDrawer({ pair, onClose, onSaved }: { pair: PricingPair; onClose: () => void; onSaved: () => void }) {
  const [spreadBps, setSpreadBps] = useState(String(pair.spreadBps));
  const [ttlSeconds, setTtlSeconds] = useState(String(pair.ttlSeconds));
  const [enabled, setEnabled] = useState(pair.enabled);
  const [maxNotional, setMaxNotional] = useState(pair.maxNotionalUsd);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!/^\d+$/.test(spreadBps.trim())) return setError('Spread is an integer of basis points.');
    if (!/^\d+$/.test(ttlSeconds.trim()) || ttlSeconds.trim() === '0') return setError('TTL is a positive integer of seconds.');
    if (!/^\d+(\.\d+)?$/.test(maxNotional.trim()) || /^0+(\.0+)?$/.test(maxNotional.trim())) {
      return setError('Max notional is a positive decimal amount.');
    }
    setBusy(true);
    setError(null);
    try {
      await pricingApi.updatePair(pair.baseCcy, pair.quoteCcy, {
        spread_bps: Number(spreadBps.trim()),
        ttl_seconds: Number(ttlSeconds.trim()),
        enabled,
        max_notional_usd: maxNotional.trim(),
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
    <Drawer
      open
      onClose={onClose}
      title={`${pair.baseCcy}/${pair.quoteCcy}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button loading={busy} onClick={save}>Save pair</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Spread (basis points)" hint="How wide the quoted spread is.">
          <Input value={spreadBps} onChange={(e) => setSpreadBps(e.target.value)} inputMode="numeric" className="font-mono" />
        </Field>
        <Field label="Quote TTL (seconds)" hint="How long a minted quote stays usable.">
          <Input value={ttlSeconds} onChange={(e) => setTtlSeconds(e.target.value)} inputMode="numeric" className="font-mono" />
        </Field>
        <Field label="Max notional (USD)" hint="The per-quote notional ceiling this pair quotes under.">
          <AmountInput currency="USD" value={maxNotional} onChange={(e) => setMaxNotional(e.target.value)} />
        </Field>
        <Field label="Quoting">
          <Checkbox label="Pair is enabled for quoting" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </Field>
        <Callout tone="warn" title="What this does">
          Changes how this pair quotes from now on. The previous values are kept in the audit trail.
        </Callout>
        {error && <Callout tone="danger">{error}</Callout>}
        <div className="text-xs text-muted">Last updated {formatDateTime(pair.updatedAt)} by {pair.updatedBy || '—'}.</div>
      </div>
    </Drawer>
  );
}
