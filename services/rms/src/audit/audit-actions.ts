/**
 * Audit actions rms emits. Everything here changes what reconciliation
 * compares or what the platform publishes about its reserves: a reserve
 * target is the mandate, a custodian drift moves Leg C's input on purpose,
 * and an attestation is the public claim. Who did each, and what it was
 * before, is written to audit_outbox in the same transaction as the change
 * and relayed to services/audit-trail.
 *
 * Custodian statements are not audited here: the poller writes them on a
 * timer with no actor, and the snapshot each one becomes is audited where it
 * lands, in core-ledger (ledger.reserve.custodian_snapshot_recorded).
 */
export const AUDIT = {
  reserveTargetSet: 'rms.reserve_target.set',
  custodianDriftSet: 'rms.custodian.drift_set',
  attestationCreated: 'rms.attestation.created',
  attestationRefused: 'rms.attestation.refused',
  attestationPublished: 'rms.attestation.published',
} as const;

export const SERVICE = 'rms';
