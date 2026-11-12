/**
 * Audit actions identity emits. A party is the identity every balance on the
 * platform hangs off, and an org membership is privilege — an `owner` can act
 * for the company — so when each came to exist, and for which Keycloak
 * subject, is evidence. Written to audit_outbox in the same transaction as
 * the rows themselves and relayed to services/audit-trail.
 */
export const AUDIT = {
  partyCreated: 'identity.party.created',
  orgCreated: 'identity.org.created',
  membershipGranted: 'identity.membership.granted',
} as const;

export const SERVICE = 'identity';

/**
 * Just-in-time provisioning has no human operator: it runs because a Keycloak
 * subject made its first request. The service is the actor and the subject is
 * who it acted for (on_behalf_of).
 */
export const PROVISIONING_ACTOR = 'service:identity';
