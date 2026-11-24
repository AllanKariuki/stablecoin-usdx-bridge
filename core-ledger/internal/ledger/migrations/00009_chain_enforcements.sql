-- +goose Up

-- H6: compliance enforcement actions become durable and asynchronous.
--
-- POST /chain/enforcement no longer waits for finality inside the HTTP
-- request — Sepolia's finalized checkpoint trails the head by two epochs,
-- which outlasts any timeout a caller can reasonably hold. Instead the route
-- records one row per compliance action (the reference is the compliance
-- action id, the PRIMARY KEY is the dedupe: a retried request can never
-- submit twice) and returns 202; the worker's sweep observes finality on its
-- own schedule and, once the transaction is FINAL or has FAILED on chain,
-- marks the row and enqueues the outbox event compliance consumes
-- (damp.ledger.chain_enforcement_finalized.v1) in the same transaction.
--
-- attempts / next_check_at give the sweep the same lease + budget discipline
-- the saga queue uses: a row is claimed by pushing next_check_at forward
-- (FOR UPDATE SKIP LOCKED), and a bounded attempt count turns "the chain
-- never answers" into a FAILED row instead of a silent one.

CREATE TABLE IF NOT EXISTS chain_enforcements (
    reference       TEXT PRIMARY KEY, -- the compliance action id (enf_…)
    action          TEXT NOT NULL
                    CHECK (action IN ('BLACKLIST', 'UNBLACKLIST', 'PAUSE', 'UNPAUSE')),
    chain           TEXT NOT NULL
                    CHECK (chain IN ('ETHEREUM', 'SOLANA')),
    address         TEXT NOT NULL DEFAULT '',
    tx_hash         TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'SUBMITTED'
                    CHECK (status IN ('SUBMITTED', 'FINAL', 'FAILED')),
    failure_reason  TEXT NOT NULL DEFAULT '',
    requested_by    TEXT NOT NULL DEFAULT '',
    on_behalf_of    TEXT NOT NULL DEFAULT '',
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_check_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The sweep's claim index: due SUBMITTED rows that already carry a hash.
CREATE INDEX IF NOT EXISTS idx_chain_enforcements_sweep
    ON chain_enforcements (next_check_at) WHERE status = 'SUBMITTED' AND tx_hash <> '';
