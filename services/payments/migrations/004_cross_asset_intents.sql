-- Cross-asset payment sources (slice 4a): an intent may settle from any of
-- the payer's wallets — fiat, custodial crypto (BTC/ETH/SOL) or USD-X — while
-- the payee receives in the intent's currency. `currency`/`amount` keep their
-- meaning: what the payee receives for a TRANSFER, what moves on the rail for
-- DEPOSIT/WITHDRAWAL. The new columns describe the *source* when it differs.
--
--   source_wallet_id  the wallet the money leaves from. For a same-currency
--                     intent it is simply the wallet the payer picked; for a
--                     cross-currency TRANSFER it debits in source_currency
--                     and the payee's wallet credits in `currency`.
--   source_currency   the source wallet's currency, upper-cased.
--   quote_id          the FX quote the movement consumes (core-ledger pins it
--                     to source_amount and the payer; single use).
--   source_amount     what the source wallet debits, in its own units. For a
--                     USD-X source this is also the redemption amount.
--   conversion_ref    the USD-X redemption saga's correlation id — the two
--                     step a USD-X-funded payment waits on.
--   conversion_next_poll_at
--                     the conversion poller's lease: CONVERTING intents are
--                     claimed like outbox rows, so every replica can poll
--                     without double-working one.
ALTER TABLE payment_intents
    ADD COLUMN IF NOT EXISTS source_wallet_id TEXT,
    ADD COLUMN IF NOT EXISTS source_currency TEXT,
    ADD COLUMN IF NOT EXISTS quote_id TEXT,
    ADD COLUMN IF NOT EXISTS source_amount NUMERIC,
    ADD COLUMN IF NOT EXISTS conversion_ref TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS conversion_next_poll_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- CONVERTING joins the status vocabulary: a USD-X-funded payment has moved
-- money (the redemption posted) but nothing has settled — the fiat leg posts
-- only once the burn saga completes. Neither REQUIRES_ACTION (waiting on the
-- customer) nor PROCESSING (waiting on a rail) says that.
ALTER TABLE payment_intents DROP CONSTRAINT IF EXISTS payment_intents_status_check;
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_status_check CHECK (status IN (
    'REQUIRES_ACTION',  -- waiting on the customer (an M-Pesa STK prompt)
    'PROCESSING',       -- the rail has it
    'CONVERTING',       -- USD-X redemption posted; waiting on the burn saga
    'SETTLED',          -- the rail confirmed AND the ledger posted
    'FAILED',
    'CANCELLED'));

-- The poller's claim query: the rows whose saga may have moved on.
CREATE INDEX IF NOT EXISTS idx_payment_intents_converting
    ON payment_intents (conversion_next_poll_at) WHERE status = 'CONVERTING';
