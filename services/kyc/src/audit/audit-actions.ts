/**
 * Audit actions kyc emits. A KYC approval is what unfreezes somebody's
 * ability to move money, so who reviewed it, and that the approval actually
 * granted what was reviewed, is evidence — written to audit_outbox in the
 * same transaction as the decision and relayed to services/audit-trail.
 */
export const AUDIT = {
  reviewed: 'kyc.case.reviewed',
  approved: 'kyc.case.approved',
  rejected: 'kyc.case.rejected',
  approvalRefused: 'kyc.case.approval_refused',
} as const;

export const SERVICE = 'kyc';

/**
 * workflow's decision callback names no human — the approvers are in
 * workflow's own audit events, under the same approval request id.
 */
export const WORKFLOW_ACTOR = 'service:workflow';
