-- +goose Up

-- H7: an operator may raise the re-sign cap for ONE correlation id at
-- runtime, instead of restarting the signer with a bigger global
-- MAX_RESIGNS_PER_CORRELATION.
--
-- The row is the *working* state: ResignAllowed and Append add `extra` to
-- the configured cap while expires_at is in the future. The *record* of who
-- granted what, when and why is a row in `signatures` with method
-- 'resign-allowance', written by the same hash-chained append path as every
-- signature — so the grant itself is append-only evidence, while this table
-- stays small and overwritable once its allowance has lapsed.
--
-- One active grant per correlation: correlation_id is the primary key, and
-- the grant endpoint refuses (409) to replace a grant that is still in
-- effect. An expired row is simply overwritten by the next grant.
--
-- extra is bounded 1..10, deliberately small: an allowance exists to get
-- ONE stuck movement past a bad run of RPC trouble, and every extra re-sign
-- that does not land reverts at the relayer's expense. Ten on top of the
-- configured cap (default 5) is already sixteen signatures for one
-- movement.
CREATE TABLE IF NOT EXISTS resign_allowances (
    correlation_id  TEXT PRIMARY KEY,
    extra           INT NOT NULL CHECK (extra BETWEEN 1 AND 10),
    granted_by      TEXT NOT NULL,
    reason          TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resign_allowances_expiry
    ON resign_allowances (expires_at);

-- +goose Down
DROP TABLE IF EXISTS resign_allowances;
