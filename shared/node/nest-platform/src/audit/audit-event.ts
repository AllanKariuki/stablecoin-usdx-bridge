import { randomUUID } from 'node:crypto';

/**
 * The producer half of services/audit-trail for NestJS services — the twin of
 * shared/go/platform/audit, and deliberately the same table, the same wire
 * shape and the same rules, so an auditor reading the trail cannot tell (and
 * need not care) which language a producer was written in.
 *
 * Why an outbox. audit-trail's recording endpoint is built never to fail, but
 * not to be never unreachable, and a producer that POSTs inline must choose,
 * on every outage, between failing the action it was auditing and doing it
 * unaudited. Writing the event into this service's own database in the same
 * transaction as the action removes the choice: the action and its evidence
 * commit or roll back together, and delivery is a separate, retryable job.
 *
 * Delivery is at-least-once, so each event's id is minted here, at enqueue,
 * and audit-trail records an id once.
 */

/**
 * Identical to shared/go/platform/audit.Schema. Each producer copies it into
 * a numbered migration under its own migrations/ directory; a test in each
 * producer compares the two so they cannot drift.
 */
export const AUDIT_OUTBOX_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS audit_outbox (
    id              BIGSERIAL PRIMARY KEY,
    -- The idempotency id services/audit-trail dedupes on. Minted here, at
    -- enqueue, so every redelivery of this row carries the same one.
    event_id        TEXT NOT NULL UNIQUE,
    action          TEXT NOT NULL,
    payload         JSONB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'DELIVERED', 'DEAD')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error      TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_audit_outbox_due
    ON audit_outbox (next_attempt_at, id) WHERE status = 'PENDING';
`;

/**
 * Anything that runs a parameterised query — a pg PoolClient inside the
 * caller's BEGIN, or a Pool for the relay. Typed structurally so this package
 * does not depend on `pg`.
 */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
}

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';

/** What a producer knows about the HTTP request behind an action. */
export interface AuditRequest {
  requestId?: string;
  sourceIp?: string;
  userAgent?: string;
  roles?: string[];
}

export interface AuditEvent {
  /** Leave unset and one is minted. Set it only to a natural id unique per *event*. */
  id?: string;
  actor: string;
  /** The roles that authorised the action. Defaults to the request's X-Roles. */
  actorRoles?: string[];
  onBehalfOf?: string;
  /** Dotted <domain>.<object>.<verb>, e.g. "workflow.request.approved". */
  action: string;
  subjectType?: string;
  subjectId?: string;
  service: string;
  outcome?: AuditOutcome;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** When the action happened. Defaults to now — inside the action's transaction. */
  occurredAt?: Date;
}

export class InvalidAuditEventError extends Error {}

/**
 * The JSON body POSTed to audit-trail. snake_case because that is its
 * contract (services/audit-trail/internal/api/handlers.go), and written out
 * field by field so a rename here can never silently become a change to it.
 */
export function auditPayload(event: AuditEvent & { id: string }, request: AuditRequest = {}): Record<string, unknown> {
  const roles = event.actorRoles && event.actorRoles.length > 0 ? event.actorRoles : request.roles;
  return stripUndefined({
    id: event.id,
    actor: event.actor,
    actor_roles: roles && roles.length > 0 ? roles : undefined,
    on_behalf_of: event.onBehalfOf,
    action: event.action,
    subject_type: event.subjectType,
    subject_id: event.subjectId,
    service: event.service,
    outcome: event.outcome ?? 'SUCCESS',
    before_state: event.beforeState,
    after_state: event.afterState,
    metadata: event.metadata,
    request_id: request.requestId,
    source_ip: request.sourceIp,
    user_agent: request.userAgent,
    // Milliseconds, which a timestamptz keeps exactly — audit-trail hashes
    // occurred_at, and a value finer than the column would hash differently
    // when read back.
    occurred_at: (event.occurredAt ?? new Date()).toISOString(),
  });
}

/**
 * Writes `event` to the outbox on `client` and returns its event id.
 *
 * `client` must be the one running the action's transaction. There is no
 * variant that opens its own: an event committed separately from the change
 * it describes is evidence of something that may have rolled back.
 *
 * An event audit-trail would refuse (no actor, no action) throws here, inside
 * the caller's transaction, rather than committing and being dead-lettered on
 * its first delivery.
 */
export async function enqueueAuditEvent(
  client: Queryable,
  event: AuditEvent,
  request: AuditRequest = {},
): Promise<string> {
  if (!event.actor?.trim() || !event.action?.trim()) {
    throw new InvalidAuditEventError(`audit events need an actor and an action (action "${event.action}")`);
  }
  if (!event.service) {
    throw new InvalidAuditEventError(`audit events need a service (action "${event.action}")`);
  }
  const id = event.id ?? randomUUID();
  if (id.length > 128) {
    throw new InvalidAuditEventError('audit event ids are at most 128 characters');
  }

  await client.query(`INSERT INTO audit_outbox (event_id, action, payload) VALUES ($1, $2, $3::jsonb)`, [
    id,
    event.action,
    JSON.stringify(auditPayload({ ...event, id }, request)),
  ]);
  return id;
}

function stripUndefined(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));
}
