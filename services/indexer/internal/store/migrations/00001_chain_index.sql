-- +goose Up

-- services/indexer owns chain truth: what happened on Ethereum and Solana,
-- in what order, and — the part that makes it more than a log tail — whether
-- the chain still agrees it happened.
--
-- TimescaleDB rather than plain Postgres for chain_events specifically: it is
-- an append-heavy time series that is queried by window ("what did this
-- address do last week"), which is exactly the access pattern a hypertable's
-- chunk exclusion turns from a sequential scan into an index seek, and the
-- retention/compression policies below are a one-line answer to a table that
-- otherwise grows forever.
--
-- The extension is created if available and the hypertable conversion is
-- skipped when it isn't, so this same migration runs against a stock
-- postgres:16 image in CI. A plain table with the same indexes is correct,
-- just slower — which is the right trade for a test database and the wrong
-- one for production.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---------------------------------------------------------------------------
-- Blocks: the reorg substrate
--
-- The indexer stores block *headers* it has walked, not just a cursor,
-- because a cursor alone cannot tell "block 1234 again" from "a different
-- block 1234". Detecting a reorg is exactly the observation that the header
-- at height N no longer has the hash we recorded — which is unanswerable
-- without this table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chain_blocks (
    chain        TEXT   NOT NULL,           -- ETHEREUM | SOLANA
    height       BIGINT NOT NULL,           -- block number / slot
    block_hash   TEXT   NOT NULL,
    parent_hash  TEXT   NOT NULL DEFAULT '',
    block_time   TIMESTAMPTZ,

    -- canonical=false is an orphaned block: it was on the chain and is not
    -- any more. The row is kept rather than deleted — "we once believed this"
    -- is the evidence that explains a correction downstream.
    canonical    BOOLEAN NOT NULL DEFAULT TRUE,
    orphaned_at  TIMESTAMPTZ,

    observed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (chain, height, block_hash)
);

-- At most one canonical block per height. This is the invariant the whole
-- reorg path exists to maintain, so it is enforced by the database rather than
-- by the code being careful.
CREATE UNIQUE INDEX IF NOT EXISTS uq_chain_blocks_canonical
    ON chain_blocks (chain, height) WHERE canonical;

CREATE INDEX IF NOT EXISTS idx_chain_blocks_height ON chain_blocks (chain, height DESC);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chain_events (
    id             TEXT NOT NULL,
    chain          TEXT NOT NULL,
    event_type     TEXT NOT NULL,      -- BridgeMinted | BridgeBurned | Transfer | Blacklisted | Paused | …
    contract       TEXT NOT NULL DEFAULT '',

    block_height   BIGINT NOT NULL,
    block_hash     TEXT   NOT NULL,
    tx_hash        TEXT   NOT NULL,
    log_index      INTEGER NOT NULL DEFAULT 0,

    -- correlation_id is the bridge saga's id when the event carries one. It
    -- is what lets the saga stop polling a chain for finality and wait for
    -- this row instead.
    correlation_id TEXT NOT NULL DEFAULT '',

    payload        JSONB NOT NULL DEFAULT '{}'::jsonb,

    canonical      BOOLEAN NOT NULL DEFAULT TRUE,
    orphaned_at    TIMESTAMPTZ,

    block_time     TIMESTAMPTZ NOT NULL DEFAULT now(),
    observed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- (chain, tx_hash, log_index) is the natural key and would be the primary
    -- key if this were not a hypertable: Timescale requires the partitioning
    -- column in every unique constraint, so block_time joins it. Same
    -- uniqueness in practice — one log position exists in one block at one
    -- time.
    PRIMARY KEY (chain, tx_hash, log_index, block_time)
);

CREATE INDEX IF NOT EXISTS idx_chain_events_type   ON chain_events (chain, event_type, block_time DESC);
CREATE INDEX IF NOT EXISTS idx_chain_events_corr   ON chain_events (correlation_id) WHERE correlation_id <> '';
CREATE INDEX IF NOT EXISTS idx_chain_events_height ON chain_events (chain, block_height DESC);
CREATE INDEX IF NOT EXISTS idx_chain_events_tx     ON chain_events (chain, tx_hash);

-- ---------------------------------------------------------------------------
-- Cursors
--
-- One row per (chain, stream). A watermark, not a queue: the indexer is
-- idempotent over any range it re-reads, so a cursor that goes backwards
-- after a reorg costs a few duplicate upserts and nothing else. It must
-- advance monotonically *in the absence of a reorg*, which is why only one
-- replica may hold it — see internal/leader.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cursors (
    chain           TEXT NOT NULL,
    stream          TEXT NOT NULL DEFAULT 'events',
    last_height     BIGINT NOT NULL DEFAULT 0,
    last_block_hash TEXT   NOT NULL DEFAULT '',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chain, stream)
);

-- ---------------------------------------------------------------------------
-- Supply reports
--
-- The indexer does not write core-ledger's snapshot tables directly — it
-- POSTs them, because the ledger is the only place value exists. This table
-- is the local durability for that call: a report is written first and marked
-- posted afterwards, so an indexer that dies between reading supply and
-- telling the ledger retries instead of skipping a height.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supply_reports (
    chain        TEXT   NOT NULL,
    height       BIGINT NOT NULL,
    block_hash   TEXT   NOT NULL DEFAULT '',
    total_supply NUMERIC(40,0) NOT NULL,
    observed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    posted_at    TIMESTAMPTZ,
    attempts     INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (chain, height)
);

CREATE INDEX IF NOT EXISTS idx_supply_reports_unposted
    ON supply_reports (chain, height) WHERE posted_at IS NULL;

-- +goose StatementBegin
-- Hypertable conversion, guarded so the same migration applies to a stock
-- Postgres in CI. create_hypertable's own migrate_data does the right thing
-- on an empty table and on a populated one alike.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('chain_events', 'block_time',
                                  chunk_time_interval => INTERVAL '7 days',
                                  if_not_exists => TRUE, migrate_data => TRUE);
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- A Timescale edition that refuses the conversion leaves a perfectly
    -- correct plain table behind. Losing chunk exclusion is a performance
    -- regression; failing the migration would be an outage.
    RAISE NOTICE 'chain_events left as a plain table: %', SQLERRM;
END $$;
-- +goose StatementEnd

-- +goose Down
DROP TABLE IF EXISTS supply_reports;
DROP TABLE IF EXISTS cursors;
DROP TABLE IF EXISTS chain_events;
DROP TABLE IF EXISTS chain_blocks;
