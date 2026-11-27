-- The price-history series behind GET /rates/history and the rates board's
-- change_24h_pct (slice 4c).
--
-- The aggregator upserts one row per (symbol, 1-minute bucket) after every
-- poll, but only for symbols it is willing to stand behind (OK, not
-- stale/tripped) — so a chart can never show a price the quote path refuses.
-- Buckets are keyed on the observation's own time, not the poll's, and a
-- later poll in the same minute overwrites (last-write-wins), which is what
-- "keep the last point per hour" in the retention pass means.
--
-- Symbol keys are the feed symbols: crypto is stored as its USD leg
-- (BTC/USD: USD per 1 BTC), fiat as the USD leg the open.er-api feed
-- observes (USD/KES: KES per 1 USD). The history endpoint converts every
-- point to the requested base through those USD legs at each point's time.
--
-- mid is NUMERIC so a psql session can inspect and chart the data, but the
-- service reads it back as a decimal string and does all arithmetic on
-- scaled integers (BigInt) — never floats, same discipline as rates.
--
-- Retention (a daily job in the rates module) keeps 1-minute buckets for 2
-- days, downsamples older rows to the last point per hour, and deletes rows
-- older than 400 days.
CREATE TABLE IF NOT EXISTS price_points (
    symbol  TEXT NOT NULL,        -- 'BTC/USD', 'USD/KES', ...
    bucket  TIMESTAMPTZ NOT NULL, -- 1-minute floor of the observation time
    mid     NUMERIC NOT NULL,     -- the aggregated mid, as a decimal string
    sources TEXT[] NOT NULL,      -- the feeds whose fresh observations fed the median
    PRIMARY KEY (symbol, bucket)
);
