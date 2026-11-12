-- services/reporting becomes an audit-trail producer (P7 follow-up).
--
-- Decisions this service makes are written here in the same transaction as
-- the decision itself, and a relay delivers them to services/audit-trail —
-- so an audit-trail outage neither blocks a decision nor loses its evidence.
-- The DDL is @damp/nest-platform's AUDIT_OUTBOX_SCHEMA_SQL verbatim (and
-- shared/go/platform/audit.Schema, the Go producers' copy); test/audit-
-- outbox-schema.spec.ts fails if they drift.

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
