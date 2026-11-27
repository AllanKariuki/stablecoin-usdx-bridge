-- +goose Up

-- Multi-asset: custodial BTC/ETH/SOL wallets join the fiat wallets and
-- USD-X. BTC wallets live on exactly one chain (BITCOIN), so the chain enum
-- grows a member; their address column stays empty because the platform,
-- not the user, holds the keys. The BTC/ETH/SOL currency rows and their
-- chart accounts are seeded in Go (Repository.Bootstrap <- DefaultCurrencies),
-- the same mechanism every other currency uses.
--
-- The CHECK below was created inline on the column in 00003_ledger_core.sql,
-- so PostgreSQL auto-named it wallets_chain_check. DROP+ADD under the same
-- name keeps the migration honest about where the constraint lives.
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_chain_check;
ALTER TABLE wallets ADD CONSTRAINT wallets_chain_check
    CHECK (chain IN ('', 'ETHEREUM', 'SOLANA', 'BITCOIN'));

-- One default wallet per (user, currency): the wallet a payment lands in
-- when the payer names only a currency. The partial unique index enforces
-- the "one" where a race between two SetDefaultWallet calls cannot: today
-- only USD-X has more than one wallet per (user, currency) (one per chain),
-- but the invariant is expressed generally.
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallets_default_per_currency
    ON wallets (user_id, currency) WHERE is_default;

-- Single-use FX quotes. The pricing service will bound its exposure per
-- quote — one party, one amount, one conversion — so a quote the ledger
-- accepts for anything else would defeat that bound. from_amount pins the
-- quote to an exact source amount (in the base currency's smallest units);
-- party_id pins it to one wallet owner. Both are nullable: a quote with
-- neither is "any amount, any party", for callers that price on the fly.
ALTER TABLE fx_quotes ADD COLUMN IF NOT EXISTS from_amount NUMERIC(38,0) CHECK (from_amount > 0);
ALTER TABLE fx_quotes ADD COLUMN IF NOT EXISTS party_id TEXT;

-- The actual single-use guarantee: a quote can be referenced by at most one
-- conversion or payment. The predicate excludes REVERSAL because reversing a
-- conversion copies its fx_quote_id and must stay postable — otherwise
-- correcting a bad conversion would itself be refused. The idempotency-key
-- fast path in Repository.Post runs before any insert, so a retry of the
-- same request returns the original transaction rather than tripping this.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_transactions_fx_quote
    ON transactions (fx_quote_id)
    WHERE fx_quote_id IS NOT NULL AND type IN ('FX_CONVERSION', 'FX_PAYMENT');

-- +goose Down

DROP INDEX IF EXISTS uniq_transactions_fx_quote;
ALTER TABLE fx_quotes DROP COLUMN IF EXISTS from_amount;
ALTER TABLE fx_quotes DROP COLUMN IF EXISTS party_id;

DROP INDEX IF EXISTS uniq_wallets_default_per_currency;
ALTER TABLE wallets DROP COLUMN IF EXISTS is_default;
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_chain_check;
-- A database that ever held a BITCOIN wallet cannot be wound back to the old
-- enum — the re-added CHECK would reject those rows. That failure is the
-- intended conversation, not an accident: Down is best-effort for schema,
-- never a promise that data rolls back with it.
ALTER TABLE wallets ADD CONSTRAINT wallets_chain_check
    CHECK (chain IN ('', 'ETHEREUM', 'SOLANA'));
