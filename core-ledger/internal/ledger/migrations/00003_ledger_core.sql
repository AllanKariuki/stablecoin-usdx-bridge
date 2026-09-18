-- +goose Up

-- Reference data. Decimals is what makes "10.00" mean 1000 in USD and
-- 10000000 in USD-X; before this table that scale was a Go constant and every
-- amount in the system was implicitly a USD-X amount.
CREATE TABLE IF NOT EXISTS currencies (
    code      TEXT PRIMARY KEY,
    kind      TEXT NOT NULL CHECK (kind IN ('FIAT', 'CRYPTO')),
    decimals  INT  NOT NULL CHECK (decimals BETWEEN 0 AND 30),
    name      TEXT NOT NULL DEFAULT '',
    active    BOOLEAN NOT NULL DEFAULT TRUE
);

-- The chart of accounts. hierarchy is a materialized path of GL codes
-- ('.1000.1100.1100.USD.') so a subtree rollup is one indexed prefix scan
-- rather than a recursive CTE — the same trick Fineract's acc_gl_account uses.
CREATE TABLE IF NOT EXISTS accounts (
    id                     TEXT PRIMARY KEY,
    gl_code                TEXT NOT NULL UNIQUE,
    name                   TEXT NOT NULL,
    type                   TEXT NOT NULL CHECK (type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
    -- '' is valid: multi-currency HEADER accounts roll up children that are
    -- each denominated in their own currency.
    currency               TEXT NOT NULL DEFAULT '',
    normal_side            TEXT NOT NULL CHECK (normal_side IN ('DEBIT','CREDIT')),
    parent_id              TEXT REFERENCES accounts (id),
    hierarchy              TEXT NOT NULL,
    usage                  TEXT NOT NULL CHECK (usage IN ('HEADER','DETAIL')),
    manual_entries_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    owner_user_id          TEXT,
    status                 TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','FROZEN','CLOSED')),
    description            TEXT NOT NULL DEFAULT '',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A DETAIL account is a leaf that holds money and therefore must know what
    -- currency that money is in; only HEADER rollups may be currency-agnostic.
    CONSTRAINT chk_accounts_detail_has_currency
        CHECK (usage = 'HEADER' OR currency <> ''),
    -- The normal side is a function of the type, not an independent field.
    CONSTRAINT chk_accounts_normal_side_matches_type
        CHECK (normal_side = CASE WHEN type IN ('ASSET','EXPENSE') THEN 'DEBIT' ELSE 'CREDIT' END)
);

CREATE INDEX IF NOT EXISTS idx_accounts_hierarchy ON accounts (hierarchy text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_accounts_owner     ON accounts (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_currency  ON accounts (currency);

-- Journal header: one business event.
CREATE TABLE IF NOT EXISTS transactions (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','REVERSED')),
    -- The uniqueness that makes a retried mint a no-op instead of a double
    -- mint. This index is the actual guarantee; the application-level lookup
    -- in Post() is just the fast path.
    idempotency_key TEXT NOT NULL UNIQUE,
    reversed        BOOLEAN NOT NULL DEFAULT FALSE,
    reversal_tx_id  TEXT REFERENCES transactions (id),
    reverses_tx_id  TEXT REFERENCES transactions (id),
    manual_entry    BOOLEAN NOT NULL DEFAULT FALSE,
    entity_type     TEXT NOT NULL DEFAULT '',
    entity_id       TEXT NOT NULL DEFAULT '',
    external_ref    TEXT NOT NULL DEFAULT '',
    fx_quote_id     TEXT,
    value_date      DATE NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    initiated_by    TEXT NOT NULL DEFAULT '',
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_entity     ON transactions (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_transactions_value_date ON transactions (value_date);
CREATE INDEX IF NOT EXISTS idx_transactions_type       ON transactions (type, created_at DESC);

-- Journal lines. Append-only by design and by trigger (see below).
CREATE TABLE IF NOT EXISTS journal_entries (
    seq             BIGSERIAL PRIMARY KEY,
    id              TEXT NOT NULL UNIQUE,
    transaction_id  TEXT NOT NULL REFERENCES transactions (id),
    line_no         INT  NOT NULL,
    account_id      TEXT NOT NULL REFERENCES accounts (id),
    direction       TEXT NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
    currency        TEXT NOT NULL REFERENCES currencies (code),
    -- Strictly positive: direction carries the sign. A signed amount column
    -- would let an unbalanced journal satisfy SUM(debits) = SUM(credits).
    amount          NUMERIC(38, 0) NOT NULL CHECK (amount > 0),
    -- The account's signed balance (in its normal side) immediately after this
    -- line. Not a mutable balance column — it belongs to this immutable row —
    -- so a current balance is an O(1) read and any drift from SUM(entries) is
    -- detectable. See Repository.VerifyRunningBalances.
    running_balance NUMERIC(38, 0) NOT NULL,
    value_date      DATE NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (transaction_id, line_no)
);

-- The hot path: "latest entry for this account" on every post, and the account
-- statement read, are both this index.
CREATE INDEX IF NOT EXISTS idx_journal_entries_account_seq ON journal_entries (account_id, seq DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_tx          ON journal_entries (transaction_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_value_date  ON journal_entries (value_date);

-- +goose StatementBegin
-- The append-only rule, enforced where it cannot be forgotten. Application
-- code is careful not to UPDATE or DELETE here; this makes a careless future
-- migration or an ad-hoc psql session fail loudly instead of silently
-- rewriting history. A correction is a reversal, always.
CREATE OR REPLACE FUNCTION journal_entries_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION
        'journal_entries is append-only (attempted % on seq %); post a reversing transaction instead',
        TG_OP, OLD.seq;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_journal_entries_append_only ON journal_entries;
CREATE TRIGGER trg_journal_entries_append_only
    BEFORE UPDATE OR DELETE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION journal_entries_append_only();

-- Period locks: Fineract's acc_gl_closure. currency = '' closes every currency.
CREATE TABLE IF NOT EXISTS ledger_closures (
    id           TEXT PRIMARY KEY,
    currency     TEXT NOT NULL DEFAULT '',
    closing_date DATE NOT NULL,
    reason       TEXT NOT NULL DEFAULT '',
    closed_by    TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_closures_lookup ON ledger_closures (currency, closing_date DESC);

-- Wallets: the product object in front of a liability account.
CREATE TABLE IF NOT EXISTS wallets (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    currency   TEXT NOT NULL REFERENCES currencies (code),
    -- '' for fiat. A USD-X holder with balances on both chains has two
    -- wallets, which is what makes a bridge a movement between two of their
    -- own accounts rather than an untracked hop.
    chain      TEXT NOT NULL DEFAULT '' CHECK (chain IN ('', 'ETHEREUM', 'SOLANA')),
    account_id TEXT NOT NULL UNIQUE REFERENCES accounts (id),
    address    TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','FROZEN','CLOSED')),
    label      TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, currency, chain)
);

CREATE INDEX IF NOT EXISTS idx_wallets_user    ON wallets (user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets (chain, address) WHERE address <> '';

-- Rates, captured at a point in time and referenced by the transaction that
-- used them, so a conversion can always be re-derived from the rate it
-- actually got rather than whatever the rate is today.
CREATE TABLE IF NOT EXISTS fx_quotes (
    id         TEXT PRIMARY KEY,
    base_ccy   TEXT NOT NULL REFERENCES currencies (code),
    quote_ccy  TEXT NOT NULL REFERENCES currencies (code),
    -- Scaled by 10^18: "1 base = rate quote", before spread.
    rate       NUMERIC(48, 0) NOT NULL CHECK (rate > 0),
    spread_bps INT NOT NULL DEFAULT 0 CHECK (spread_bps BETWEEN 0 AND 10000),
    source     TEXT NOT NULL DEFAULT '',
    quoted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_fx_quotes_distinct_pair CHECK (base_ccy <> quote_ccy)
);

CREATE INDEX IF NOT EXISTS idx_fx_quotes_pair ON fx_quotes (base_ccy, quote_ccy, quoted_at DESC);

ALTER TABLE transactions ADD CONSTRAINT fk_transactions_fx_quote
    FOREIGN KEY (fx_quote_id) REFERENCES fx_quotes (id);

-- The bridge saga stops being the record of value and becomes what it always
-- was: workflow state. These columns tie it back to the journal.
ALTER TABLE bridge_transfers ADD COLUMN IF NOT EXISTS user_id          TEXT NOT NULL DEFAULT '';
ALTER TABLE bridge_transfers ADD COLUMN IF NOT EXISTS source_wallet_id TEXT NOT NULL DEFAULT '';
ALTER TABLE bridge_transfers ADD COLUMN IF NOT EXISTS target_wallet_id TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE bridge_transfers DROP COLUMN IF EXISTS target_wallet_id;
ALTER TABLE bridge_transfers DROP COLUMN IF EXISTS source_wallet_id;
ALTER TABLE bridge_transfers DROP COLUMN IF EXISTS user_id;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_fx_quote;
DROP TABLE IF EXISTS fx_quotes;
DROP TABLE IF EXISTS wallets;
DROP TABLE IF EXISTS ledger_closures;
DROP TRIGGER IF EXISTS trg_journal_entries_append_only ON journal_entries;
DROP FUNCTION IF EXISTS journal_entries_append_only();
DROP TABLE IF EXISTS journal_entries;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS currencies;
