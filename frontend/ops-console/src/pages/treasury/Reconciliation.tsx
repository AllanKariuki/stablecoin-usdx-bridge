import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, CheckCircle2 } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { reservesApi, type ReconciliationRun } from '@damp/web-shared/api/reserves';
import { formatDateTime, humanize, timeAgo, useAsync } from '@damp/web-shared/lib';
import { Card, DataTable, Drawer, ErrorState, KeyValueList, MonoRef, PageHeader, Skeleton, StatusBadge, Tabs } from '@damp/web-shared/ui';
import { LEGS, LegVerdict } from '../../components/LegStatus';
import { RunVerdicts } from './ReservesDashboard';

const duration = (seconds: number) => {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86_400)} d`;
};

export default function Reconciliation() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'breaks' ? 'breaks' : 'runs';
  const runs = useAsync(() => reservesApi.runs(100), []);
  const breaks = useAsync(() => reservesApi.openBreaks(), []);
  const [runId, setRunId] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        eyebrow="Treasury"
        title="Reconciliation"
        description="Every run of the three-leg check, and the breaks still open. Figures are raw smallest units — the scale a figure was compared at is part of the evidence."
      />
      <Tabs
        value={tab}
        onChange={(t) => setParams(t === 'runs' ? {} : { tab: t }, { replace: true })}
        tabs={[
          { value: 'runs', label: 'Runs' },
          { value: 'breaks', label: 'Open breaks', count: breaks.data?.length },
        ]}
      />
      <Card>
        {tab === 'runs' ? (
          <DataTable
            caption="Reconciliation runs"
            rows={runs.data}
            loading={runs.loading}
            error={runs.error ? apiErrorMessage(runs.error) : undefined}
            onRetry={runs.reload}
            rowKey={(r) => r.id}
            onRowClick={(r) => setRunId(r.id)}
            empty={{ icon: <Activity className="size-6" aria-hidden />, title: 'No runs yet', body: 'Runs appear here once the reconcile job has executed.' }}
            columns={[
              { key: 'at', header: 'Started', render: (r) => <span title={formatDateTime(r.started_at)}>{timeAgo(r.started_at)}</span> },
              { key: 'legs', header: 'Legs', render: (r) => <RunVerdicts run={r} /> },
              { key: 'breaks', header: 'Breaks', render: (r) => <span className="font-mono tabular-nums">{r.break_count}</span> },
              { key: 'by', header: 'Trigger', render: (r) => humanize(r.triggered_by), hideOnMobile: true },
              { key: 'status', header: 'Status', align: 'right', render: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
        ) : (
          <DataTable
            caption="Open reconciliation breaks"
            rows={breaks.data}
            loading={breaks.loading}
            error={breaks.error ? apiErrorMessage(breaks.error) : undefined}
            onRetry={breaks.reload}
            rowKey={(b) => b.id}
            empty={{ icon: <CheckCircle2 className="size-6" aria-hidden />, title: 'No open breaks', body: 'Every leg agreed on the last run that evaluated it.' }}
            columns={[
              { key: 'leg', header: 'Leg', render: (b) => <span className="font-bold text-navy">{LEGS.find((l) => l.key === b.leg)?.name ?? b.leg}</span> },
              { key: 'code', header: 'Code', render: (b) => humanize(b.code) },
              { key: 'drift', header: 'Drift now', align: 'right', render: (b) => <span className="font-mono text-warn-ink">{b.drift}</span> },
              { key: 'first', header: 'First drift', align: 'right', render: (b) => <span className="font-mono text-muted">{b.first_drift}</span>, hideOnMobile: true },
              { key: 'open', header: 'Open for', render: (b) => duration(b.open_seconds) },
              { key: 'seen', header: 'Observed', render: (b) => `${b.observations}×`, hideOnMobile: true },
              { key: 'detail', header: 'Detail', render: (b) => <span className="font-mono text-[11.5px] break-all text-muted">{b.detail}</span>, hideOnMobile: true },
            ]}
          />
        )}
      </Card>
      {runId && <RunDrawer runId={runId} onClose={() => setRunId(null)} />}
    </>
  );
}

function RunDrawer({ runId, onClose }: { runId: string; onClose: () => void }) {
  const run = useAsync(() => reservesApi.run(runId), [runId]);
  const r = run.data;
  return (
    <Drawer open onClose={onClose} title="Reconciliation run">
      {run.error ? (
        <ErrorState message={apiErrorMessage(run.error)} onRetry={run.reload} />
      ) : !r ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="flex flex-col gap-5">
          <KeyValueList
            items={[
              { label: 'Run', value: <MonoRef value={r.id} /> },
              { label: 'Status', value: <StatusBadge status={r.status} /> },
              { label: 'Started', value: formatDateTime(r.started_at) },
              { label: 'Duration', value: r.duration_ms !== undefined ? `${r.duration_ms} ms` : '—' },
              ...(r.error ? [{ label: 'Error', value: r.error }] : []),
            ]}
          />
          <div className="grid gap-2">
            {LEGS.map((l) => (
              <div key={l.key} className="flex items-center justify-between gap-3 rounded-[12px] border border-line px-3 py-2.5">
                <span className="text-sm font-semibold">
                  {l.name} · {l.title}
                </span>
                <LegVerdict ok={r[l.field as keyof ReconciliationRun] as boolean | null} compact />
              </div>
            ))}
          </div>
          <div>
            <p className="eyebrow mb-1.5 text-[11px]">Figures compared (smallest units)</p>
            <KeyValueList
              items={[
                { label: 'Issued', value: r.issued, mono: true },
                { label: 'In transit', value: r.in_transit, mono: true },
                { label: 'Ethereum supply', value: r.eth_supply, mono: true },
                { label: 'Solana supply', value: r.sol_supply, mono: true },
                { label: 'Backing', value: r.backing, mono: true },
                { label: 'Ledger cash', value: r.ledger_cash, mono: true },
                { label: 'Bank balance', value: r.bank_balance, mono: true },
                { label: 'Bank as of', value: formatDateTime(r.bank_as_of) },
              ]}
            />
          </div>
          {r.breaks.length > 0 && (
            <div>
              <p className="eyebrow mb-1.5 text-[11px]">Breaks on this run</p>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {r.breaks.map((b) => (
                  <li key={b.id} className="rounded-[12px] border border-warn-line bg-warn-bg p-3 text-[13px] text-warn-deep">
                    <strong>{LEGS.find((l) => l.key === b.leg)?.name ?? b.leg}</strong> · {humanize(b.code)} · drift <span className="font-mono">{b.drift}</span>
                    {b.resolved_at && <span className="ml-1">(resolved {timeAgo(b.resolved_at)})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
