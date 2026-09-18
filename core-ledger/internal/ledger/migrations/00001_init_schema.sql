-- +goose Up
-- CREATE TABLE IF NOT EXISTS so this applies cleanly against a dev DB that
-- already has these tables from GORM's AutoMigrate, before goose took over
-- schema management.
CREATE TABLE IF NOT EXISTS bridge_transfers (
    correlation_id  TEXT PRIMARY KEY,
    user_address    TEXT NOT NULL,
    amount          NUMERIC(38, 0) NOT NULL,
    -- '' is a valid value here (a fresh mint with no source_chain, per
    -- bridge/saga.go's isBridgeTransfer check) — NOT allowing it, as the
    -- original raw-SQL migration did, would reject every fresh-mint insert.
    -- Named explicitly (matching GORM's chk_<table>_<field> convention) so
    -- 00002_fix_source_chain_check.sql can target it deterministically on
    -- either a fresh install or a DB that predates goose (from AutoMigrate).
    source_chain    TEXT CONSTRAINT chk_bridge_transfers_source_chain
                        CHECK (source_chain IN ('', 'ETHEREUM', 'SOLANA')),
    target_chain    TEXT NOT NULL CHECK (target_chain IN ('ETHEREUM', 'SOLANA')),
    status          TEXT NOT NULL DEFAULT 'PENDING',
    source_tx_hash  TEXT,
    dest_tx_hash    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bridge_transfers_status ON bridge_transfers (status);

CREATE TABLE IF NOT EXISTS eth_supply_snapshot (
    block_number  BIGINT PRIMARY KEY,
    total_supply  NUMERIC(38, 0) NOT NULL,
    captured_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sol_supply_snapshot (
    slot          BIGINT PRIMARY KEY,
    total_supply  NUMERIC(38, 0) NOT NULL,
    captured_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trust_bank_snapshot (
    as_of    TIMESTAMPTZ PRIMARY KEY DEFAULT now(),
    balance  NUMERIC(38, 0) NOT NULL
);

-- +goose Down
DROP TABLE IF EXISTS trust_bank_snapshot;
DROP TABLE IF EXISTS sol_supply_snapshot;
DROP TABLE IF EXISTS eth_supply_snapshot;
DROP TABLE IF EXISTS bridge_transfers;
