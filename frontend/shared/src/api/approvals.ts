import { get, post, qs } from './client';

/** services/workflow (maker-checker), via bff. Shapes mirror requests.controller.ts's render(). */
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface ApprovalPolicy {
  id: string;
  action: string;
  description: string;
  approvalsRequired: number;
  approverRoles: string[];
  excludeInitiator: boolean;
  expiresAfterHours: number;
}

export interface ApprovalRequest {
  id: string;
  action: string;
  subjectType: string;
  subjectId: string;
  /** What the approver is confirming — re-verified by the acting service before it acts. */
  payloadDigest: string;
  summary: Record<string, unknown>;
  requestedBy: string;
  reason: string;
  status: ApprovalStatus;
  approvals: Array<{ decision: string; decidedBy: string; comment: string; at: string }>;
  expiresAt: string;
  decidedAt?: string | null;
  createdAt?: string;
}

export const approvalsApi = {
  policies: async () => (await get<{ policies: ApprovalPolicy[] }>('/approval-policies')).policies,
  /** Pending requests, or every request for one subject when both filters are given. */
  list: async (filter: { subjectType?: string; subjectId?: string } = {}) =>
    (await get<{ requests: ApprovalRequest[] }>(`/approval-requests${qs(filter)}`)).requests,
  get: (id: string) => get<ApprovalRequest>(`/approval-requests/${encodeURIComponent(id)}`),
  propose: (input: { action: string; subjectType: string; subjectId: string; payload: unknown; summary?: Record<string, unknown>; reason?: string }) =>
    post<ApprovalRequest>('/approval-requests', input),
  approve: (id: string, comment?: string) => post<ApprovalRequest>(`/approval-requests/${encodeURIComponent(id)}/approve`, { comment }),
  reject: (id: string, comment?: string) => post<ApprovalRequest>(`/approval-requests/${encodeURIComponent(id)}/reject`, { comment }),
  cancel: (id: string) => post<ApprovalRequest>(`/approval-requests/${encodeURIComponent(id)}/cancel`),
};
