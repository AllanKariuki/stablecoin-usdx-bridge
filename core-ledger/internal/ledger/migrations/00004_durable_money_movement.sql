-- +goose Up

-- ---------------------------------------------------------------------------
-- Transactional outbox
--
-- Rows are written inside Repository.Post's existing SERIALIZABLE transaction,
-- so "the journal was posted" and "the event was emitted" commit together or
-- not at all. A relay drains them afterwards (HTTP POST today, nats.Publish in
-- P3) — the domain code never learns which.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outbox_events (
    id              BIGSERIAL PRIMARY KEY,
    event_type      TEXT NOT NULL,          -- damp.<domain>.<event>.v1
    aggregate_type  TEXT NOT NULL,          -- 'TRANSACTION'
    aggregate_id    TEXT NOT NULL,          -- transactions.id
    payload         JSONB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'PUBLISHED', 'DEAD')),
    attempts        INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error      TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ
);

-- The claim query's covering index: relays take the oldest due row with
-- FOR UPDATE SKIP LOCKED, so the partial predicate must match the WHERE
-- clause exactly or every claim degrades to a sequential scan over history.
CREATE INDEX IF NOT EXISTS idx_outbox_events_claimable
    ON outbox_events (next_attempt_at, id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate
    ON outbox_events (aggregate_type, aggregate_id);

-- ---------------------------------------------------------------------------
-- Bridge saga durability
--
-- Everything the fire-and-forget `go saga.Execute(...)` had no way to express:
-- which shape of saga this is, which journal transaction it settles, how many
-- times it has been tried, when it may next be tried, and which worker
-- currently holds it.
-- ---------------------------------------------------------------------------
ALTER TABLE bridge_transfers
    ADD COLUMN IF NOT EXISTS kind             TEXT NOT NULL DEFAULT 'BRIDGE',
    ADD COLUMN IF NOT EXISTS ledger_tx_id     TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS attempts         INT  NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS lease_owner      TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_error       TEXT NOT NULL DEFAULT '';

-- Existing rows predate the column: a fresh mint is exactly the one with no
-- source chain, which is how the old saga told the two apart.
UPDATE bridge_transfers SET kind = 'MINT' WHERE source_chain = '';

-- No default from here on, so an insert that forgets to say which shape of
-- saga it is fails loudly rather than silently becoming a cross-chain bridge.
ALTER TABLE bridge_transfers ALTER COLUMN kind DROP DEFAULT;

-- A redemption burns on its source chain and mints nowhere, so target_chain
-- is '' — the same relaxation 00002 made for source_chain on the fresh-mint
-- path. The original constraint was anonymous, hence Postgres's generated
-- name; the replacement is named explicitly so a later migration can target it.
ALTER TABLE bridge_transfers DROP CONSTRAINT IF EXISTS bridge_transfers_target_chain_check;
ALTER TABLE bridge_transfers DROP CONSTRAINT IF EXISTS chk_bridge_transfers_target_chain;
ALTER TABLE bridge_transfers ADD CONSTRAINT chk_bridge_transfers_target_chain
    CHECK (target_chain IN ('', 'ETHEREUM', 'SOLANA'));

-- With both chain columns now nullable-by-emptiness, the shape of the saga is
-- the only thing that says which combination is legal.
ALTER TABLE bridge_transfers DROP CONSTRAINT IF EXISTS chk_bridge_transfers_kind_chains;
ALTER TABLE bridge_transfers ADD CONSTRAINT chk_bridge_transfers_kind_chains CHECK (
    (kind = 'MINT'   AND source_chain = ''  AND target_chain <> '') OR
    (kind = 'REDEEM' AND source_chain <> '' AND target_chain = '')  OR
    (kind = 'BRIDGE' AND source_chain <> '' AND target_chain <> '')
);

ALTER TABLE bridge_transfers DROP CONSTRAINT IF EXISTS chk_bridge_transfers_status;
ALTER TABLE bridge_transfers ADD CONSTRAINT chk_bridge_transfers_status
    CHECK (status IN ('PENDING', 'BURN_CONFIRMED', 'MINT_SUBMITTED',
                      'COMPLETED', 'FAILED', 'COMPENSATED'));

-- Mirrors the outbox claim index: due, unleased, not yet terminal.
CREATE INDEX IF NOT EXISTS idx_bridge_transfers_claimable
    ON bridge_transfers (next_attempt_at, correlation_id)
    WHERE status IN ('PENDING', 'BURN_CONFIRMED', 'MINT_SUBMITTED');

-- ---------------------------------------------------------------------------
-- Dead letters
--
-- Where a saga goes when its attempt budget is spent. Separate from the
-- transfer row because the transfer's own status answers "where is the money",
-- while this answers "what does an operator have to do about it" — and the two
-- have different lifecycles once someone starts working the queue.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saga_dead_letters (
    correlation_id TEXT PRIMARY KEY REFERENCES bridge_transfers (correlation_id),
    kind           TEXT NOT NULL,
    stage          TEXT NOT NULL,   -- which step exhausted its budget
    attempts       INT  NOT NULL,
    last_error     TEXT NOT NULL,
    failed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at    TIMESTAMPTZ,
    resolved_by    TEXT NOT NULL DEFAULT '',
    resolution     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_saga_dead_letters_open
    ON saga_dead_letters (failed_at) WHERE resolved_at IS NULL;

-- ---------------------------------------------------------------------------
-- Idempotent response replay
--
-- transactions.idempotency_key already stops a retry from posting twice, but
-- the retry still re-ran the handler and could return a different body (or, on
-- the issuance path, a duplicate-key 500). A client that cannot tell whether
-- money moved retries by hand, which is the exact double-spend idempotency
-- exists to prevent. Storing the response bytes makes the second call byte-
-- identical to the first.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_records (
    key           TEXT PRIMARY KEY,
    endpoint      TEXT NOT NULL,        -- "POST /deposits"
    request_hash  TEXT NOT NULL,        -- sha256 of the request body
    status        TEXT NOT NULL DEFAULT 'IN_PROGRESS'
                      CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
    status_code   INT,
    response_body BYTEA,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ
);

-- +goose Down
DROP TABLE IF EXISTS idempotency_records;
DROP INDEX IF EXISTS idx_saga_dead_letters_open;
DROP TABLE IF EXISTS saga_dead_letters;

DROP INDEX IF EXISTS idx_bridge_transfers_claimable;
ALTER TABLE bridge_transfers DROP CONSTRAINT IF EXISTS chk_bridge_transfers_status;
ALTER TABLE bridge_transfers DROP CONSTRAINT IF EXISTS chk_bridge_transfers_kind_chains;
ALTER TABLE bridge_transfers DROP CONSTRAINT IF EXISTS chk_bridge_transfers_target_chain;
DELETE FROM bridge_transfers WHERE target_chain = '';
ALTER TABLE bridge_transfers ADD CONSTRAINT bridge_transfers_target_chain_check
    CHECK (target_chain IN ('ETHEREUM', 'SOLANA'));
ALTER TABLE bridge_transfers
    DROP COLUMN IF EXISTS last_error,
    DROP COLUMN IF EXISTS lease_expires_at,
    DROP COLUMN IF EXISTS lease_owner,
    DROP COLUMN IF EXISTS next_attempt_at,
    DROP COLUMN IF EXISTS attempts,
    DROP COLUMN IF EXISTS ledger_tx_id,
    DROP COLUMN IF EXISTS kind;

DROP INDEX IF EXISTS idx_outbox_events_aggregate;
DROP INDEX IF EXISTS idx_outbox_events_claimable;
DROP TABLE IF EXISTS outbox_events;
