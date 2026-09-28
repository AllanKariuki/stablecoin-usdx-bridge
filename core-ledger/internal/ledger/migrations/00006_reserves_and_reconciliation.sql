-- +goose Up

-- P3 turns reconciliation from a log line into a record.
--
-- Before this migration the job ran on a 5-minute in-process ticker, once per
-- API replica, and its only output was log.Printf. Nothing persisted, so
-- "was the platform balanced at 03:00 last Tuesday" had no answer, a break
-- that healed itself was indistinguishable from one nobody noticed, and the
-- one control that catches an unbacked mint could not be paged from.
--
-- Two tables, with the split that matters: a *run* is an observation (it
-- happened, here is what every leg read), and a *break* is a condition (it
-- opened at some point, stayed open across N runs, and closed at some other
-- point). Folding them together would make "how long were we out of balance"
-- unanswerable, which is the first question a regulator asks.

CREATE TABLE IF NOT EXISTS reconciliation_runs (
    id            TEXT PRIMARY KEY,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ,

    -- OK | BREAKS | ERROR. ERROR is "the check could not be performed" (an
    -- RPC was down), which is not the same as "the check passed" and must
    -- never be counted as one.
    status        TEXT NOT NULL,

    -- Per-leg verdicts. NULL means the leg was not evaluated this run — Leg C
    -- is skipped when no custodian has ever reported — which is again
    -- distinct from passing.
    leg_a_ok      BOOLEAN,
    leg_b_ok      BOOLEAN,
    leg_c_ok      BOOLEAN,

    -- Everything the legs were computed from, in smallest units, so a run can
    -- be re-derived years later without the source systems.
    issued        NUMERIC(40,0),
    in_transit    NUMERIC(40,0),
    eth_supply    NUMERIC(40,0),
    sol_supply    NUMERIC(40,0),
    backing       NUMERIC(40,0),
    ledger_cash   NUMERIC(40,0),
    bank_balance  NUMERIC(40,0),
    bank_as_of    TIMESTAMPTZ,

    break_count   INTEGER NOT NULL DEFAULT 0,
    error         TEXT NOT NULL DEFAULT '',
    triggered_by  TEXT NOT NULL DEFAULT 'cron'
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_started
    ON reconciliation_runs (started_at DESC);

-- A break is keyed by (leg, code) rather than by run: the same shortfall seen
-- on twelve consecutive runs is one break with twelve observations, not twelve
-- breaks. That is what makes `open breaks` a work queue an operator can
-- actually finish, and what lets the drift be shown as "growing" or "steady".
CREATE TABLE IF NOT EXISTS reconciliation_breaks (
    id             TEXT PRIMARY KEY,
    leg            TEXT NOT NULL,            -- LEG_A | LEG_B | LEG_C
    code           TEXT NOT NULL,            -- LEDGER_CHAIN_DRIFT | PEG_BROKEN | CUSTODIAN_SHORTFALL
    detail         TEXT NOT NULL DEFAULT '',

    opened_run_id  TEXT NOT NULL REFERENCES reconciliation_runs (id),
    opened_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_run_id    TEXT NOT NULL REFERENCES reconciliation_runs (id),
    last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    observations   INTEGER NOT NULL DEFAULT 1,

    -- Signed, in the leg's own unit: negative is "less than there should be".
    first_drift    NUMERIC(40,0),
    drift          NUMERIC(40,0),

    resolved_at    TIMESTAMPTZ,
    resolved_run_id TEXT REFERENCES reconciliation_runs (id)
);

-- One open break per (leg, code) — the partial index is what enforces
-- "the same condition is one row", since resolved rows must be allowed to
-- repeat for the same pair.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reconciliation_breaks_open
    ON reconciliation_breaks (leg, code) WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reconciliation_breaks_open
    ON reconciliation_breaks (opened_at DESC) WHERE resolved_at IS NULL;

-- ---------------------------------------------------------------------------
-- Snapshot writers
--
-- All three snapshot tables existed from migration 00001 and none of them had
-- a writer: eth/sol_supply_snapshot were never inserted into at all, and
-- trust_bank_snapshot's comment named a "Bank Adapter service (not part of
-- this repo)" that does not exist — which is why Leg C was permanently
-- skipped. P3 gives the first two to services/indexer and the third to
-- services/rms, so the columns below are what those writers need in order to
-- be auditable: who said so, and on the strength of what.
-- ---------------------------------------------------------------------------

ALTER TABLE eth_supply_snapshot
    ADD COLUMN IF NOT EXISTS block_hash  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS source      TEXT NOT NULL DEFAULT '';

ALTER TABLE sol_supply_snapshot
    ADD COLUMN IF NOT EXISTS source      TEXT NOT NULL DEFAULT '';

-- trust_bank_snapshot was keyed on as_of alone, which silently assumed one
-- custodian holding one currency forever. A platform with a second custodian
-- (or a second peg currency) would have had the two overwrite each other at
-- the same timestamp and Leg C would have compared against whichever landed
-- last.
ALTER TABLE trust_bank_snapshot
    ADD COLUMN IF NOT EXISTS custodian_id TEXT NOT NULL DEFAULT 'primary',
    ADD COLUMN IF NOT EXISTS currency     TEXT NOT NULL DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS source       TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS statement_ref TEXT NOT NULL DEFAULT '';

ALTER TABLE trust_bank_snapshot DROP CONSTRAINT IF EXISTS trust_bank_snapshot_pkey;
ALTER TABLE trust_bank_snapshot
    ADD CONSTRAINT trust_bank_snapshot_pkey PRIMARY KEY (custodian_id, currency, as_of);

CREATE INDEX IF NOT EXISTS idx_trust_bank_snapshot_latest
    ON trust_bank_snapshot (currency, as_of DESC);

-- +goose Down
DROP TABLE IF EXISTS reconciliation_breaks;
DROP TABLE IF EXISTS reconciliation_runs;

ALTER TABLE trust_bank_snapshot DROP CONSTRAINT IF EXISTS trust_bank_snapshot_pkey;
ALTER TABLE trust_bank_snapshot
    DROP COLUMN IF EXISTS custodian_id,
    DROP COLUMN IF EXISTS currency,
    DROP COLUMN IF EXISTS source,
    DROP COLUMN IF EXISTS statement_ref;
ALTER TABLE trust_bank_snapshot ADD CONSTRAINT trust_bank_snapshot_pkey PRIMARY KEY (as_of);

ALTER TABLE eth_supply_snapshot DROP COLUMN IF EXISTS block_hash, DROP COLUMN IF EXISTS source;
ALTER TABLE sol_supply_snapshot DROP COLUMN IF EXISTS source;
