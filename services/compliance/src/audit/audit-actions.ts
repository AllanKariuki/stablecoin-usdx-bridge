/**
 * Audit actions compliance emits. Every one of these is a decision somebody
 * will be asked to defend — a blacklist, a pause, a SAR — so each is written
 * to audit_outbox in the same transaction as the decision (see
 * @damp/nest-platform enqueueAuditEvent) and relayed to services/audit-trail.
 */
export const AUDIT = {
  enforcementProposed: 'compliance.enforcement.proposed',
  enforcementApproved: 'compliance.enforcement.approved',
  enforcementRejected: 'compliance.enforcement.rejected',
  enforcementExecuted: 'compliance.enforcement.executed',
  approvalRefused: 'compliance.enforcement.approval_refused',
  caseAssigned: 'compliance.case.assigned',
  caseClosed: 'compliance.case.closed',
  alertDismissed: 'compliance.alert.dismissed',
} as const;

export const SERVICE = 'compliance';

/**
 * workflow's decision callback names no human — the approvers are in
 * workflow's own audit events, under the same approval request id. The actor
 * here is the service that delivered the decision.
 */
export const WORKFLOW_ACTOR = 'service:workflow';
