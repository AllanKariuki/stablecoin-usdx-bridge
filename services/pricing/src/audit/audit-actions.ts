/**
 * Audit actions pricing emits. Pair policy changes move what the platform
 * charges and how long a quoted rate stays usable, so every change is
 * written to audit_outbox in the same transaction as the change and
 * relayed to services/audit-trail — who did it, and what the row was
 * before, is the only way a spread change is ever explainable after the
 * fact.
 *
 * Quote issuance itself is not audited here: every quote is already
 * recorded in quotes_issued (exposure) and journaled in core-ledger under
 * the ledger.pricing actor, and an audit event on top would duplicate
 * what the ledger owns.
 */
export const AUDIT = {
  pairUpdated: 'pricing.pair.updated',
} as const;

export const SERVICE = 'pricing';
