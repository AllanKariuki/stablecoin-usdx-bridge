-- Slice 3a: the house's custodial-crypto exposure policy and the treasury
-- desk's rebalance journal.
--
-- Since slice 1, customers hold BTC/ETH/SOL ledger claims acquired by FX
-- conversion, which makes the house short crypto until treasury buys it at a
-- custodian. What lives here is the *policy* around that position — how short
-- or long the desk may let it run (exposure_limits) and the desk's own record
-- of each trade (treasury_rebalances). The position itself lives in
-- core-ledger's journal; rms reads it through GET /treasury/positions and
-- posts trades through POST /treasury/rebalances.

-- Custodians now cover custodial crypto, not just fiat: the stub reports the
-- ledger's custody holdings (GET /treasury/positions) plus a configurable
-- drift, exactly like the fiat stub reports the ledger's cash. The check
-- keeps a typo from silently creating a custodian no provider will answer for.
ALTER TABLE custodians DROP CONSTRAINT IF EXISTS custodians_currency_check;
ALTER TABLE custodians ADD CONSTRAINT custodians_currency_check
    CHECK (currency IN ('USD', 'EUR', 'GBP', 'KES', 'BTC', 'ETH', 'SOL'));

-- A crypto custodian per currency so a fresh environment has a snapshot to
-- reconcile, mirroring 001's seeded 'primary' fiat custodian. Their drift
-- starts at zero; POST /custodians/:id/drift is how the demo breaks it.
--
-- Crypto custodian statements are stored in custodian_statements like every
-- other statement, but they are deliberately NOT posted to core-ledger's
-- /reserves/custodian-snapshots: that endpoint feeds trust_bank_snapshot,
-- which is the USD-X peg leg. The crypto reconciliation happens here in rms
-- (GET /exposure) against the ledger's own custody holdings.
INSERT INTO custodians (id, name, currency, provider, account_ref, config)
VALUES ('crypto-btc', 'Crypto Custody — BTC', 'BTC', 'stub', 'DAMP-CRYPTO-BTC-001', '{"drift": "0"}'),
       ('crypto-eth', 'Crypto Custody — ETH', 'ETH', 'stub', 'DAMP-CRYPTO-ETH-001', '{"drift": "0"}'),
       ('crypto-sol', 'Crypto Custody — SOL', 'SOL', 'stub', 'DAMP-CRYPTO-SOL-001', '{"drift": "0"}')
ON CONFLICT (id) DO NOTHING;

-- Exposure limits are policy, not accounting: "the house may run the BTC
-- position at most this short and this long". Limits are in crypto units at
-- the currency's own scale, stored as NUMERIC and carried as decimal strings
-- on the wire — the same discipline as every other amount in this platform.
-- A missing row means "no policy for this currency" and the check allows the
-- trade; the seeds below set the launch policy for all three.
CREATE TABLE IF NOT EXISTS exposure_limits (
    currency   TEXT PRIMARY KEY,
    max_short  NUMERIC NOT NULL CHECK (max_short >= 0),
    max_long   NUMERIC NOT NULL CHECK (max_long >= 0),
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO exposure_limits (currency, max_short, max_long, updated_by)
VALUES ('BTC', 5, 5, 'seed'),
       ('ETH', 100, 100, 'seed'),
       ('SOL', 5000, 5000, 'seed')
ON CONFLICT (currency) DO NOTHING;

-- The treasury desk's own record of each trade, beside the journal entry it
-- produced. ledger_tx_id is UNIQUE so a retry of the same trade (same
-- deterministic Idempotency-Key on the ledger call) reconciles to the same
-- row instead of a second one; NULLs stay multiple because a rejected or
-- half-failed trade has no ledger transaction.
CREATE TABLE IF NOT EXISTS treasury_rebalances (
    id            TEXT PRIMARY KEY,
    side          TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
    currency      TEXT NOT NULL,
    amount        TEXT NOT NULL,
    fiat_currency TEXT NOT NULL,
    fiat_amount   TEXT NOT NULL,
    custodian_ref TEXT NOT NULL DEFAULT '',
    note          TEXT NOT NULL DEFAULT '',
    ledger_tx_id  TEXT UNIQUE,
    created_by    TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treasury_rebalances_created
    ON treasury_rebalances (created_at DESC);
