/**
 * Audit actions reporting emits: who ran which report, who took a copy of it
 * out of the platform, and who was handed a token to look at a dashboard.
 * None of these change a balance, but "who exported what" is the first
 * question after a data leak, and a report run is a record somebody may file.
 * Each is written to audit_outbox in a transaction that must commit before
 * the result leaves this service — an export with no evidence is refused
 * rather than served.
 */
export const AUDIT = {
  reportRun: 'reporting.report.run',
  reportExported: 'reporting.report.exported',
  guestTokenIssued: 'reporting.superset.guest_token_issued',
  guestTokenRefused: 'reporting.superset.guest_token_refused',
} as const;

export const SERVICE = 'reporting';
