import { get, post, qs } from './client';

/** services/compliance, via bff. Shapes mirror cases/cases.controller.ts. */
export type AlertStatus = 'OPEN' | 'DISMISSED' | 'ESCALATED' | string;

export interface ComplianceAlert {
  id: string;
  rule: string;
  severity: string;
  partyId: string;
  transactionId: string | null;
  detail: string;
  evidence: Record<string, unknown> | null;
  caseId: string | null;
  status: AlertStatus;
  createdAt: string;
}

export interface ComplianceCase {
  id: string;
  reference: string;
  partyId: string;
  /** OPEN, CLOSED_CLEARED or CLOSED_SAR. */
  status: string;
  severity: string;
  title: string;
  summary: string;
  assignedTo: string | null;
  closedAt: string | null;
  closedBy: string | null;
  createdAt: string;
}

export interface ComplianceCaseDetail extends ComplianceCase {
  alerts: Array<{ id: string; rule: string; severity: string; detail: string; transactionId: string | null; at: string }>;
  notes: Array<{ author: string; note: string; at: string }>;
  enforcementActions: Array<{ id: string; kind: string; target: string; status: string; reason: string; chainTxHash: string | null; at: string }>;
}

export interface SarReport {
  reference: string;
  partyId: string;
  filedAt: string | null;
  filedBy: string;
  narrative: string;
  supportingActivity: Array<{ rule: string; detail: string; transactionId: string | null; evidence: unknown; at: string }>;
}

export type EnforcementKind = 'BLACKLIST' | 'UNBLACKLIST' | 'PAUSE' | 'UNPAUSE' | 'FREEZE_WALLET' | 'UNFREEZE_WALLET';

export interface EnforcementAction {
  id: string;
  kind: EnforcementKind;
  chain: string | null;
  target: string | null;
  partyId: string | null;
  status: string;
  reason: string;
  requestedBy: string;
  approvalRequestId: string | null;
  chainTxHash: string | null;
  failureReason: string | null;
  createdAt: string;
  executedAt: string | null;
}

export interface ScreeningResult {
  outcome: 'CLEAR' | 'REVIEW' | 'REJECT';
  riskScore: number;
  matches: unknown[];
  raw: Record<string, unknown>;
}

const id = encodeURIComponent;

export const complianceApi = {
  /** status: OPEN (default), DISMISSED, ESCALATED or ALL. */
  alerts: async (status = 'OPEN') => (await get<{ alerts: ComplianceAlert[] }>(`/compliance/alerts${qs({ status })}`)).alerts,
  dismissAlert: (alertId: string, reason: string) => post<unknown>(`/compliance/alerts/${id(alertId)}/dismiss`, { reason }),
  cases: async (status?: string) => (await get<{ cases: ComplianceCase[] }>(`/compliance/cases${qs({ status })}`)).cases,
  caseDetail: (caseId: string) => get<ComplianceCaseDetail>(`/compliance/cases/${id(caseId)}`),
  addNote: (caseId: string, note: string) => post<unknown>(`/compliance/cases/${id(caseId)}/notes`, { note }),
  assign: (caseId: string, assignee: string) => post<unknown>(`/compliance/cases/${id(caseId)}/assign`, { assignee }),
  close: (caseId: string, input: { outcome: 'CLEARED' | 'SAR'; notes?: string; sarNarrative?: string }) =>
    post<unknown>(`/compliance/cases/${id(caseId)}/close`, input),
  sar: (caseId: string) => get<SarReport>(`/compliance/cases/${id(caseId)}/sar`),
  screen: (subjectType: 'PARTY' | 'ADDRESS' | 'BANK_ACCOUNT', subject: string) => post<ScreeningResult>('/compliance/screenings', { subjectType, subject }),
  enforcement: async () => (await get<{ actions: EnforcementAction[] }>('/compliance/enforcement')).actions,
  /** Opens a maker-checker request; the signer acts only after approval. */
  proposeEnforcement: (input: { kind: EnforcementKind; chain?: string; target?: string; partyId?: string; caseId?: string; reason: string }) =>
    post<{ id: string; status: string; approvalRequestId: string | null }>('/compliance/enforcement', input),
};
