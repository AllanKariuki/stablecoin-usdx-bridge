-- payments' transactional outbox.
--
-- Until now a settlement told the customer with a best-effort POST to
-- services/notifications made *after* the intent was marked. If notifications
-- was down at that moment, the email and the push were simply gone: the money
-- had moved, the journal said so, and nothing anywhere remembered that
-- somebody still needed telling.
--
-- An event row is now written in the same transaction as the state change it
-- describes — markSettled, markFailed, an invoice being issued — so "the
-- intent says SETTLED" and "a payment.settled event exists" commit or roll
-- back together. The relay (src/outbox/outbox.relay.ts) delivers rows to
-- notifications with backoff. Same shape as core-ledger's outbox and
-- notifications' own webhook_deliveries, for the same reasons.

CREATE TABLE IF NOT EXISTS outbox (
    -- `evt_<uuid>`. Also the idempotency key notifications dedupes on: the
    -- relay is at-least-once by design — one that dies between a successful
    -- POST and marking the row PUBLISHED delivers it again — so the consumer
    -- has to be able to recognise a replay.
    id              TEXT PRIMARY KEY,
    event           TEXT NOT NULL,
    party_id        TEXT NOT NULL DEFAULT '',
    payload         JSONB NOT NULL,

    status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'PUBLISHED', 'DEAD')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    -- Doubles as the claim lease: claiming a row pushes this forward, so a
    -- relay that crashes mid-delivery leaves the row due again a minute later
    -- rather than stuck.
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error      TEXT NOT NULL DEFAULT '',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_due ON outbox (next_attempt_at) WHERE status = 'PENDING';
-- DEAD rows are the ones a human has to look at; keep finding them cheap.
CREATE INDEX IF NOT EXISTS idx_outbox_dead ON outbox (created_at DESC) WHERE status = 'DEAD';
