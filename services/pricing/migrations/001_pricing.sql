-- services/pricing's pair policy and quote ledger.
--
-- pricing_pairs is policy: how wide the spread is, how long a quote lives,
-- and how much USD of notional one quote may cover. The numbers it holds
-- are what the service sends to core-ledger's POST /fx/quotes; the ledger
-- then applies the spread itself, so this table and the ledger can never
-- drift apart on what a conversion charges.
--
-- quotes_issued is exposure: every quote requested is recorded here, pinned
-- to its party, so the exposure guard can answer "how much outstanding
-- notional does this party have" without asking the ledger. A row is born
-- RESERVED — its notional already counted against the party's outstanding
-- cap — and flips to ISSUED, carrying the ledger's own quote id, once
-- core-ledger has minted it; a failed ledger call deletes the reservation.

CREATE TABLE IF NOT EXISTS pricing_pairs (
    base_ccy         TEXT NOT NULL,
    quote_ccy        TEXT NOT NULL,

    -- The spread the ledger applies on top of the rate: net =
    -- gross * (1 - spread_bps/10000). 0..10000 keeps a pair from being
    -- configured into a rebate.
    spread_bps       INTEGER NOT NULL DEFAULT 50 CHECK (spread_bps BETWEEN 0 AND 10000),

    -- Quote lifetime. Crypto pairs are 30s because a crypto mid moves in
    -- seconds; fiat pairs get 300s because their reference rates move daily.
    ttl_seconds      INTEGER NOT NULL DEFAULT 300 CHECK (ttl_seconds > 0),

    enabled          BOOLEAN NOT NULL DEFAULT TRUE,

    -- The per-quote notional ceiling in USD, checked by the exposure guard
    -- before the ledger is called. NUMERIC because it is money; it is
    -- compared on scaled integers, never floats.
    max_notional_usd NUMERIC NOT NULL DEFAULT 10000 CHECK (max_notional_usd > 0),

    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by       TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (base_ccy, quote_ccy)
);

-- Seed every ordered pair among the quotable currencies, so any supported
-- conversion has a policy row without an admin having to create one first.
-- USD-X is absent: it is issued 1:1 against USD and never quoted.
INSERT INTO pricing_pairs (base_ccy, quote_ccy, spread_bps, ttl_seconds, max_notional_usd)
SELECT b.currency, q.currency, 50, 300, 10000
FROM unnest(ARRAY['USD', 'EUR', 'GBP', 'KES']) AS b(currency)
CROSS JOIN unnest(ARRAY['USD', 'EUR', 'GBP', 'KES']) AS q(currency)
WHERE b.currency <> q.currency
ON CONFLICT (base_ccy, quote_ccy) DO NOTHING;

-- Anything with a crypto side: a wider spread, because the house is quoting
-- a volatile asset, and a short TTL, because that volatility ages a quote
-- in seconds.
INSERT INTO pricing_pairs (base_ccy, quote_ccy, spread_bps, ttl_seconds, max_notional_usd)
SELECT b.currency, q.currency, 100, 30, 10000
FROM unnest(ARRAY['USD', 'EUR', 'GBP', 'KES', 'BTC', 'ETH', 'SOL']) AS b(currency)
CROSS JOIN unnest(ARRAY['USD', 'EUR', 'GBP', 'KES', 'BTC', 'ETH', 'SOL']) AS q(currency)
WHERE b.currency <> q.currency
  AND (b.currency IN ('BTC', 'ETH', 'SOL') OR q.currency IN ('BTC', 'ETH', 'SOL'))
ON CONFLICT (base_ccy, quote_ccy) DO NOTHING;

-- One row per quote requested of core-ledger. from_amount/rate are decimal
-- strings (the same shape the ledger stores and formats), sources is the
-- list of feeds the rate was aggregated from, and notional_usd is the USD
-- value of from_amount — the number the exposure guard sums. quote_id is
-- NULL while the row is RESERVED and filled with the ledger's id once the
-- quote is minted.
CREATE TABLE IF NOT EXISTS quotes_issued (
    reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id       TEXT UNIQUE,
    status         TEXT NOT NULL DEFAULT 'RESERVED'
                   CHECK (status IN ('RESERVED', 'ISSUED')),
    party_id       TEXT NOT NULL,
    base           TEXT NOT NULL,
    quote          TEXT NOT NULL,
    from_amount    TEXT NOT NULL,
    rate           TEXT NOT NULL,
    spread_bps     INTEGER NOT NULL,
    notional_usd   NUMERIC NOT NULL,
    sources        JSONB NOT NULL,
    expires_at     TIMESTAMPTZ NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The guard's outstanding window is "status = 'ISSUED' AND expires_at >
-- now()" (plus in-flight RESERVED rows younger than 60s), so the
-- party+expires_at scan is the hot path.
CREATE INDEX IF NOT EXISTS idx_quotes_issued_party_expires
    ON quotes_issued (party_id, expires_at);
