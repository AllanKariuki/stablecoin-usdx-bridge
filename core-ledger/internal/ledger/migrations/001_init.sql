CREATE TABLE bridge_transfers (
    correlation_id  UUID PRIMARY KEY,
    user_address    TEXT NOT NULL,
    amount          NUMERIC(38, 0) NOT NULL,
    source_chain    TEXT NOT NULL CHECK (source_chain IN ('ETHEREUM', 'SOLANA')),
    target_chain    TEXT NOT NULL CHECK (target_chain IN ('ETHEREUM', 'SOLANA')),
    status          TEXT NOT NULL DEFAULT 'PENDING',
    source_tx_hash  TEXT,
    dest_tx_hash    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bridge_transfers_status ON bridge_transfers (status);

CREATE TABLE eth_supply_snapshot (
    block_number  BIGINT PRIMARY KEY,
    total_supply  NUMERIC(38, 0) NOT NULL,
    captured_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sol_supply_snapshot (
    slot          BIGINT PRIMARY KEY,
    total_supply  NUMERIC(38, 0) NOT NULL,
    captured_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trust_bank_snapshot (
    as_of    TIMESTAMPTZ PRIMARY KEY DEFAULT now(),
    balance  NUMERIC(38, 0) NOT NULL
);
