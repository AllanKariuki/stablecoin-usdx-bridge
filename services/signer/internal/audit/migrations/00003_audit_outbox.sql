-- +goose Up

-- P7 follow-up: signer becomes an audit-trail producer.
--
-- The signatures table stays the signer's own record — append-only, hash
-- chained, verified at boot — and nothing about it changes. This outbox is a
-- second copy for services/audit-trail, written in the same SERIALIZABLE
-- transaction as each signatures row, so "every authorisation of every
-- movement of money" is also in the one place an auditor reads everything
-- else, carrying the signer row's own hash so the two can be checked against
-- each other.
--
-- The DDL is shared/go/platform/audit.Schema verbatim; audit_test.go fails if
-- they drift.

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
