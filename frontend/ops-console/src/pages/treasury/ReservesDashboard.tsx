import { Link } from 'react-router-dom';
import { ArrowRight, Coins, Landmark, Scale, ShieldCheck, Siren } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { reservesApi, type ReconciliationRun, type ReserveStatus } from '@damp/web-shared/api/reserves';
import { formatDateTime, humanize, timeAgo, useAsync } from '@damp/web-shared/lib';
import { Badge, Callout, Card, CardHeader, ErrorState, MoneyText, Skeleton, StatTile } from '@damp/web-shared/ui';
import { LEGS, LegVerdict } from '../../components/LegStatus';

const ratio = (bps: number | null | undefined) => (bps === null || bps === undefined ? '—' : `${(bps / 100).toFixed(2)}%`);

/**
 * The treasury workspace's flagship: is every USD-X backed, and do the three
 * reconciliation legs agree? Status and coverage come from rms; leg verdicts
 * from core-ledger's latest reconciliation run.
 */
export function ReservesDashboard() {
  const status = useAsync(() => reservesApi.status(), []);
  const runs = useAsync(() => reservesApi.runs(1), []);
  const latest = runs.data?.[0];

  if (status.error && runs.error) {
    return <ErrorState title="Reserve data didn't load" message={apiErrorMessage(status.error)} onRetry={() => (status.reload(), runs.reload())} />;
  }

  const s = status.data;
  const mandate = s?.coverage.withinMandate;

  return (
    <div className="flex flex-col gap-5">
      {s && s.openBreaks.length > 0 && (
        <Callout
          tone="warn"
          title={`${s.openBreaks.length} open reconciliation break${s.openBreaks.length === 1 ? '' : 's'}`}
          action={
            <Link to="/reconciliation?tab=breaks" className="inline-flex items-center gap-1 text-sm font-bold text-warn-deep">
              Investigate <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        >
          Attestations are refused while breaks are open, unless they are acknowledged on the attestation.
        </Callout>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile tone="navy" label="USD-X issued" icon={<Coins className="size-4" aria-hidden />} loading={status.loading} value={s ? <MoneyText money={s.issued} className="text-[26px]" /> : '—'} note={s && <>In transit: {s.inTransit.display}</>} />
        <StatTile label="Reserve backing" icon={<Landmark className="size-4" aria-hidden />} loading={status.loading} value={s ? <MoneyText money={s.backing} className="text-[26px]" /> : '—'} note={s && <>Ledger cash: {s.ledgerCash.display}</>} />
        <StatTile
          label="Coverage"
          icon={<Scale className="size-4" aria-hidden />}
          tone={mandate === false ? 'warn' : 'default'}
          loading={status.loading}
          value={ratio(s?.coverage.ratioBps)}
          note={s?.target ? <>Mandate ≥ {ratio(s.target.minRatioBps)} · {mandate === null ? 'not evaluated' : mandate ? 'within mandate' : 'outside mandate'}</> : 'No reserve target set'}
        />
        <StatTile
          label="Custodian balance"
          icon={<ShieldCheck className="size-4" aria-hidden />}
          loading={status.loading}
          value={s?.custodian ? <MoneyText money={s.custodian.balance} className="text-[26px]" /> : '—'}
          note={s?.custodian ? <>Statement {timeAgo(s.custodian.asOf)}</> : 'No custodian statement yet'}
        />
      </div>

      <Card>
        <CardHeader
          title="Reconciliation legs"
          description={latest ? <>Latest run {timeAgo(latest.finished_at ?? latest.started_at)} · {humanize(latest.triggered_by)}</> : 'From the latest reconciliation run'}
          actions={
            <Link to="/reconciliation" className="inline-flex items-center gap-1 text-sm font-semibold text-action no-underline hover:underline">
              All runs <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        />
        {runs.loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-36 rounded-card" />
            ))}
          </div>
        ) : !latest ? (
          <p className="text-sm text-muted">No reconciliation has run yet. Nothing below can be treated as a pass.</p>
        ) : (
          <LegCards run={latest} status={s} />
        )}
      </Card>

      {s && Object.keys(s.chains).length > 0 && (
        <Card>
          <CardHeader title="On-chain supply" description="Raw smallest units, as the indexer captured them." />
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(s.chains).map(([chain, c]) => (
              <div key={chain} className="rounded-[14px] border border-line bg-canvas p-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-navy">{humanize(chain)}</span>
                  <span className="text-xs text-muted">{c.captured_at ? `captured ${timeAgo(c.captured_at)}` : 'never captured'}</span>
                </div>
                <p className="mt-2 font-mono text-[15px] text-ink">{c.total_supply ?? '—'}</p>
                <p className="mt-0.5 text-xs text-muted">Block {c.height ?? '—'}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function LegCards({ run, status }: { run: ReconciliationRun; status?: ReserveStatus }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {LEGS.map((leg) => {
        const ok = run[leg.field];
        const breaks = status?.openBreaks.filter((b) => b.leg === leg.key) ?? [];
        return (
          <section key={leg.key} className={`flex flex-col gap-3 rounded-card border p-4 ${ok === false ? 'border-warn-line bg-warn-bg' : 'border-line bg-surface'}`} aria-label={`${leg.name}: ${leg.title}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="eyebrow text-[11px]">{leg.name}</p>
                <h3 className="mt-0.5 text-base font-bold text-navy">{leg.title}</h3>
              </div>
              <LegVerdict ok={ok} />
            </div>
            <p className="text-[13px] leading-relaxed text-muted">{leg.description}</p>
            <div className="mt-auto flex flex-col gap-1.5 border-t border-line pt-3 text-xs">
              <span className="text-muted">Checked {formatDateTime(run.finished_at ?? run.started_at)}</span>
              {breaks.length > 0 ? (
                breaks.map((b) => (
                  <Link key={b.id} to="/reconciliation?tab=breaks" className="flex items-center justify-between gap-2 rounded-[10px] bg-warn-tint px-2.5 py-1.5 font-semibold text-warn-ink no-underline">
                    <span className="flex items-center gap-1.5">
                      <Siren className="size-3.5" aria-hidden />
                      {humanize(b.code)}
                    </span>
                    <span className="font-mono">drift {b.drift}</span>
                  </Link>
                ))
              ) : ok === false ? (
                <Badge tone="warn">Break recorded on this run</Badge>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function RunVerdicts({ run }: { run: ReconciliationRun }) {
  return (
    <span className="flex flex-wrap gap-1">
      {LEGS.map((l) => (
        <span key={l.key} className="inline-flex items-center gap-1">
          <span className="sr-only">{l.name}:</span>
          <span aria-hidden className="font-mono text-[11px] text-muted">{l.key.slice(-1)}</span>
          <LegVerdict ok={run[l.field]} compact />
        </span>
      ))}
    </span>
  );
}
