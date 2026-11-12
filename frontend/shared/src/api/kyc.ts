import { get, post } from './client';

/** services/kyc, via bff. Shapes mirror cases.controller.ts. */
export type KycCaseStatus = 'DRAFT' | 'SUBMITTED' | 'SCREENING' | 'PENDING_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface KycStatus {
  tier: string;
  tierRank: number;
  description: string;
  limits: { currency: string; daily: string; monthly: string; singleTransaction: string };
  can: { deposit: boolean; withdraw: boolean; issue: boolean; bridge: boolean };
  openCase: { id: string; status: KycCaseStatus; requestedTier: string } | null;
  nextTierRequires: { tier: string; documents: string[] } | null;
}

export interface KycCase {
  id: string;
  partyId: string;
  requestedTier: string;
  status: KycCaseStatus;
  riskScore: number | null;
  reviewedBy: string;
  reviewNotes: string;
  rejectionReason: string;
  approvalRequestId: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface KycDocument {
  id: string;
  kind: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  status: string;
  uploadedAt: string;
}

/** Reviewer view: adds the provider's raw result, which is never shown to the applicant. */
export interface KycCaseDetail extends KycCase {
  providerResult: Record<string, unknown>;
  documents: KycDocument[];
}

export interface KycTier {
  name: string;
  rank: number;
  description: string;
  currency: string;
  dailyLimit: string;
  monthlyLimit: string;
  singleTxLimit: string;
  canDeposit: boolean;
  canWithdraw: boolean;
  canIssue: boolean;
  canBridge: boolean;
  requiredDocuments: string[];
}

export interface UploadSlot {
  storageKey: string;
  /** null when the deployment has no object store configured. */
  uploadUrl: string | null;
  expiresInSeconds: number;
  contentType: string;
}

const sha256Hex = async (file: Blob) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), (b) => b.toString(16).padStart(2, '0')).join('');

export const kycApi = {
  // Applicant (kyc:submit)
  status: () => get<KycStatus>('/kyc/status'),
  myCases: async () => (await get<{ cases: KycCase[] }>('/kyc/cases')).cases,
  tiers: async () => (await get<{ tiers: KycTier[] }>('/kyc/tiers')).tiers,
  openCase: (tier = 'TIER_1') => post<KycCase>('/kyc/cases', { tier }),
  submit: (caseId: string, profile: { email: string; fullName: string; country: string }) =>
    post<KycCase>(`/kyc/cases/${encodeURIComponent(caseId)}/submit`, profile),

  /**
   * Upload one document: ask for a presigned slot, PUT the file straight to
   * object storage (it never passes through a DAMP service), then confirm it
   * with its size and SHA-256 so the service can detect a swapped object.
   */
  async uploadDocument(caseId: string, kind: string, file: File) {
    const id = encodeURIComponent(caseId);
    const slot = await post<UploadSlot>(`/kyc/cases/${id}/documents/upload-url`, { kind, contentType: file.type || 'application/octet-stream' });
    if (slot.uploadUrl) {
      const put = await fetch(slot.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': slot.contentType } });
      if (!put.ok) throw new Error('The document upload was refused by storage. Try again.');
    }
    return (
      await post<{ documents: KycDocument[] }>(`/kyc/cases/${id}/documents`, {
        kind,
        storageKey: slot.storageKey,
        contentType: slot.contentType,
        sizeBytes: file.size,
        sha256: await sha256Hex(file),
      })
    ).documents;
  },

  // Reviewer (kyc:review)
  queue: async () => (await get<{ cases: KycCase[] }>('/kyc/queue')).cases,
  caseDetail: (caseId: string) => get<KycCaseDetail>(`/kyc/cases/${encodeURIComponent(caseId)}`),
  review: (caseId: string, decision: 'APPROVE' | 'REJECT', notes?: string) =>
    post<KycCase>(`/kyc/cases/${encodeURIComponent(caseId)}/review`, { decision, notes }),
  partyTier: (partyId: string, history = false) =>
    get<{ tier: string; limits: { daily: string; monthly: string; singleTransaction: string }; history?: unknown[] }>(
      `/kyc/parties/${encodeURIComponent(partyId)}/tier${history ? '?history=true' : ''}`,
    ),
};
