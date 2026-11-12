import { get, post, put } from './client';
import type { Money } from './money';

/**
 * Reserves for the treasury workspace. Two owners behind one path prefix:
 * services/rms serves status, targets, custodians and attestations (Money
 * shapes, camelCase); core-ledger serves reconciliation runs and breaks
 * (snake_case, raw smallest-unit strings — a run row is forensic evidence
 * and is deliberately not re-scaled).
 */
export interface ReserveStatus {
  currency: string;
  issued: Money;
  inTransit: Money;
  backing: Money;
  ledgerCash: Money;
  custodian: { balance: Money; asOf: string; ageSeconds: number } | null;
  chains: Record<string, { total_supply: string | null; height: number | null; captured_at: string | null }>;
  target: { minRatioBps: number; bufferAmount: Money; note: string } | null;
  coverage: { ratioBps: number | null; withinMandate: boolean | null };
  openBreaks: Array<{ id: string; leg: string; code: string; detail: string; drift: string; opened_at: string }>;
  lastRun: { id: string; status: string; started_at: string } | null;
}

export interface ReserveTarget {
  currency: string;
  minRatioBps: number;
  bufferAmount: string;
  note: string;
}

export interface Custodian {
  id: string;
  name: string;
  currency: string;
  provider: string;
  accountRef: string;
  status: string;
  /** A configured test drift, as a signed decimal string. */
  drift: string;
}

export interface CustodianStatement {
  id: string;
  balance: Money;
  asOf: string;
  statementRef: string;
  source: string;
  postedAt: string | null;
  postAttempts: number;
  lastError: string;
}

export interface Attestation {
  id: string;
  asOf: string;
  currency: string;
  issued: Money;
  backing: Money;
  custodianTotal: Money;
  chainSupply: unknown;
  reconciliationRunId: string;
  status: string;
  publishedAt: string | null;
  preparedBy: string;
}

/** Three-valued per leg: null means "not evaluated", which must never render as a pass. */
export interface ReconciliationRun {
  id: string;
  status: string;
  started_at: string;
  finished_at?: string;
  duration_ms?: number;
  break_count: number;
  triggered_by: string;
  error: string;
  leg_a_ok: boolean | null;
  leg_b_ok: boolean | null;
  leg_c_ok: boolean | null;
  issued: string;
  in_transit: string;
  eth_supply: string;
  sol_supply: string;
  backing: string;
  ledger_cash: string;
  bank_balance: string;
  bank_as_of?: string;
}

export interface ReconciliationBreak {
  id: string;
  leg: string;
  code: string;
  detail: string;
  drift: string;
  first_drift: string;
  opened_at: string;
  last_seen_at: string;
  resolved_at?: string;
  observations: number;
  open_seconds: number;
}

const id = encodeURIComponent;

export const reservesApi = {
  status: () => get<ReserveStatus>('/reserves/status'),
  targets: async () => (await get<{ targets: ReserveTarget[] }>('/reserves/targets')).targets,
  setTarget: (currency: string, input: { minRatioBps: number; bufferAmount?: string; note?: string }) =>
    put<ReserveTarget>(`/reserves/targets/${id(currency)}`, input),
  custodians: async () => (await get<{ custodians: Custodian[] }>('/custodians')).custodians,
  statements: async (custodianId: string) =>
    (await get<{ custodianId: string; statements: CustodianStatement[] }>(`/custodians/${id(custodianId)}/statements`)).statements,
  poll: (custodianId: string) => post<{ custodianId: string; balance: Money; asOf: string; postedAt: string | null }>(`/custodians/${id(custodianId)}/poll`),
  setDrift: (custodianId: string, drift: string) => post<unknown>(`/custodians/${id(custodianId)}/drift`, { drift }),
  attestations: async () => (await get<{ attestations: Attestation[] }>('/attestations')).attestations,
  attestation: (attestationId: string) => get<Attestation>(`/attestations/${id(attestationId)}`),
  /** Refused while reconciliation breaks are open unless acknowledgeBreaks is set (they are then recorded on it). */
  createAttestation: (input: { preparedBy?: string; acknowledgeBreaks?: boolean }) => post<Attestation>('/attestations', input),
  publishAttestation: (attestationId: string) => post<Attestation>(`/attestations/${id(attestationId)}/publish`),

  runs: async (limit = 50) => (await get<{ runs: ReconciliationRun[] }>('/reserves/reconciliation-runs', { limit })).runs,
  run: (runId: string) => get<ReconciliationRun & { breaks: ReconciliationBreak[] }>(`/reserves/reconciliation-runs/${id(runId)}`),
  openBreaks: async () => (await get<{ breaks: ReconciliationBreak[] }>('/reserves/reconciliation-breaks')).breaks,
};
