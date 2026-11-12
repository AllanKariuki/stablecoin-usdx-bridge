import { get, http, post } from './client';

/** services/reporting, via bff. Shapes mirror reports.controller.ts / reports.service.ts. */
export interface ReportDefinition {
  id: string;
  name: string;
  kind: string;
  description: string;
  params: Record<string, unknown>;
  requiredPermission: string;
}

export interface ReportRunSummary {
  id: string;
  kind: string;
  status: 'RUNNING' | 'COMPLETE' | 'FAILED';
  rowCount: number;
  requestedBy: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface ReportRun extends Omit<ReportRunSummary, 'error'> {
  definitionId: string;
  params: Record<string, unknown>;
  result: { columns: string[]; rows: Array<Record<string, unknown>>; summary?: Record<string, unknown> } | null;
  error: string;
  /** Also sent as X-Report-Result-Hash on the CSV, so a file can be matched to its run. */
  resultHash: string;
}

const id = encodeURIComponent;

export const reportsApi = {
  definitions: async () => (await get<{ reports: ReportDefinition[] }>('/reports')).reports,
  runs: async (limit = 50) => (await get<{ runs: ReportRunSummary[] }>('/reports/runs', { limit })).runs,
  run: (runId: string) => get<ReportRun>(`/reports/runs/${id(runId)}`),
  /** Running a report reads data only (reports:read); it records a run, it moves nothing. */
  start: (definitionId: string, params: Record<string, unknown> = {}) => post<ReportRun>(`/reports/${id(definitionId)}/run`, params),
  /**
   * Fetches the stored CSV with the bearer token (a plain link can't carry
   * it) and hands it to the browser as a download.
   */
  async downloadCsv(runId: string) {
    const res = await http.get<Blob>(`/reports/runs/${id(runId)}/export.csv`, { responseType: 'blob' });
    const disposition = String(res.headers['content-disposition'] ?? '');
    const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `report_${runId}.csv`;
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return { hash: String(res.headers['x-report-result-hash'] ?? '') };
  },
};
