-- +goose Up

-- P7 follow-up: core-ledger becomes an audit-trail producer.
--
-- A second outbox rather than more rows in outbox_events, because the two
-- have different destinations and different failure rules. outbox_events
-- drains to one place (NATS or OUTBOX_RELAY_URL) and dead-letters after
-- twelve attempts; an audit event drains to services/audit-trail and never
-- gives up on a transient failure, because an audit-trail outage must not
-- become a hole in the trail. One table serving both would need a relay that
-- knew which rule applied to which row — two relays and two tables is
-- simpler and each stays legible.
--
-- The DDL is shared/go/platform/audit.Schema verbatim; @damp/nest-platform's
-- AUDIT_OUTBOX_SCHEMA_SQL is the same table for the Node producers.

CREATE TABLE IF NOT EXISTS audit_outbox (
    id              BIGSERIAL PRIMARY KEY,
    -- The idempotency id services/audit-trail dedupes on. Minted at enqueue,
    -- so every redelivery of this row carries the same one.
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

-- +goose Down
DROP TABLE IF EXISTS audit_outbox;
