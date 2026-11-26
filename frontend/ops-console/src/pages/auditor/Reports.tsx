import { useState } from 'react';
import { Download, FileBarChart, Play } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { reportsApi, type ReportRunSummary } from '@damp/web-shared/api/reports';
import { Can } from '@damp/web-shared/auth';
import { formatDateTime, humanize, timeAgo, useAsync } from '@damp/web-shared/lib';
import { Button, Callout, Card, CardHeader, DataTable, Drawer, ErrorState, KeyValueList, MonoRef, PageHeader, Skeleton, StatusBadge } from '@damp/web-shared/ui';

/**
 * Report definitions and their runs. Running a report reads data and records
 * a run (reports:read); it changes nothing in the ledger, so it is available
 * to auditors. A run's CSV is the stored result, never a fresh query.
 */
export default function Reports() {
  const defs = useAsync(() => reportsApi.definitions(), []);
  const runs = useAsync(() => reportsApi.runs(50), []);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReportRunSummary | null>(null);

  const start = async (definitionId: string) => {
    setStarting(definitionId);
    setError(null);
    try {
      await reportsApi.start(definitionId);
      runs.reload();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setStarting(null);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Evidence" title="Reports" description="Trial balance packs, reconciliation history and statements, each run kept as a record with a result hash." />
      {error && <Callout tone="danger" className="mb-5">{error}</Callout>}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {defs.loading
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-card" />)
          : defs.error
            ? <Card className="sm:col-span-2 xl:col-span-3"><ErrorState message={apiErrorMessage(defs.error)} onRetry={defs.reload} /></Card>
            : defs.data?.map((d) => (
                <Card key={d.id} interactive className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid size-10 place-items-center rounded-[12px] bg-action-tint text-action">
                      <FileBarChart className="size-5" aria-hidden />
                    </span>
                    <span className="eyebrow text-[11px]">{humanize(d.kind)}</span>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-navy">{d.name}</h2>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">{d.description}</p>
                  </div>
                  <Can anyOf={['reports:read']}>
                    <Button size="sm" variant="secondary" className="mt-auto self-start" loading={starting === d.id} icon={<Play className="size-3.5" aria-hidden />} onClick={() => start(d.id)}>
                      Run report
                    </Button>
                  </Can>
                </Card>
              ))}
      </div>
      <Card>
        <CardHeader title="Runs" />
        <DataTable
          caption="Report runs"
          rows={runs.data}
          loading={runs.loading}
          error={runs.error ? apiErrorMessage(runs.error) : undefined}
          onRetry={runs.reload}
          rowKey={(r) => r.id}
          onRowClick={setSelected}
          empty={{ icon: <FileBarChart className="size-6" aria-hidden />, title: 'No runs yet', body: 'Run a report above to create one.' }}
          columns={[
            { key: 'kind', header: 'Report', render: (r) => <span className="font-semibold">{humanize(r.kind)}</span> },
            { key: 'at', header: 'Started', render: (r) => <span title={formatDateTime(r.startedAt)}>{timeAgo(r.startedAt)}</span> },
            { key: 'rows', header: 'Rows', align: 'right', render: (r) => <span className="font-mono tabular-nums">{r.rowCount}</span>, hideOnMobile: true },
            { key: 'by', header: 'Requested by', render: (r) => <span className="font-mono text-[12.5px]">{r.requestedBy.slice(0, 12)}</span>, hideOnMobile: true },
            { key: 'status', header: 'Status', align: 'right', render: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      </Card>
      {selected && <RunDrawer runId={selected.id} onClose={() => setSelected(null)} />}
    </>
  );
}

function RunDrawer({ runId, onClose }: { runId: string; onClose: () => void }) {
  const run = useAsync(() => reportsApi.run(runId), [runId]);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const r = run.data;
  const columns = r?.result?.columns ?? [];
  const rows = r?.result?.rows.slice(0, 50) ?? [];

  return (
    <Drawer
      open
      onClose={onClose}
      title={r ? humanize(r.kind) : 'Report run'}
      footer={
        r?.status === 'COMPLETE' && (
          <Button
            icon={<Download className="size-4" aria-hidden />}
            loading={downloading}
            onClick={async () => {
              setDownloading(true);
              setDownloadError(null);
              try {
                await reportsApi.downloadCsv(r.id);
              } catch (err) {
                setDownloadError(apiErrorMessage(err));
              } finally {
                setDownloading(false);
              }
            }}
          >
            Download CSV
          </Button>
        )
      }
    >
      {run.error ? (
        <ErrorState message={apiErrorMessage(run.error)} onRetry={run.reload} />
      ) : !r ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="flex flex-col gap-5">
          {downloadError && <Callout tone="danger">{downloadError}</Callout>}
          {r.error && <Callout tone="danger" title="This run failed">{r.error}</Callout>}
          <KeyValueList
            items={[
              { label: 'Run', value: <MonoRef value={r.id} /> },
              { label: 'Status', value: <StatusBadge status={r.status} /> },
              { label: 'Started', value: formatDateTime(r.startedAt) },
              { label: 'Finished', value: formatDateTime(r.finishedAt) },
              { label: 'Rows', value: r.rowCount },
              { label: 'Result hash', value: <MonoRef value={r.resultHash} /> },
            ]}
          />
          {columns.length > 0 && (
            <div>
              <p className="eyebrow mb-2 text-[11px]">Preview{r.rowCount > rows.length ? ` · first ${rows.length} of ${r.rowCount}` : ''}</p>
              <div className="overflow-x-auto rounded-[12px] border border-line">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead className="bg-canvas">
                    <tr>
                      {columns.map((c) => (
                        <th key={c} scope="col" className="px-3 py-2 text-left font-bold whitespace-nowrap text-muted">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-t border-line">
                        {columns.map((c) => (
                          <td key={c} className="px-3 py-1.5 font-mono whitespace-nowrap text-ink">
                            {String(row[c] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
