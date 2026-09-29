-- +goose Up

-- services/signer's own database. Two tables, and between them they answer
-- the two questions an incident asks: "what did this key sign" and "has
-- anything been removed from that record".

-- ---------------------------------------------------------------------------
-- The signature log
--
-- Append-only, and hash-chained. Every row carries the hash of its
-- predecessor, so removing or altering one breaks every hash after it — a
-- tamper is detectable by anyone who can read the table, without trusting the
-- process that wrote it.
--
-- That matters here more than anywhere else in the platform: this log is the
-- record of every authorisation of every movement of money, and the most
-- valuable thing an attacker who reached this service could do afterwards is
-- delete the evidence.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS signatures (
    seq             BIGSERIAL PRIMARY KEY,
    id              TEXT NOT NULL UNIQUE,

    chain           TEXT NOT NULL,
    method          TEXT NOT NULL,
    key_id          TEXT NOT NULL,
    backend         TEXT NOT NULL,

    -- The authenticated mTLS client identity. Not a header, not a claim in a
    -- body: the CN of the certificate that completed the handshake.
    caller          TEXT NOT NULL,

    -- What was signed, decoded. Amounts as decimal strings at the asset's own
    -- scale, like everywhere else.
    amount          TEXT NOT NULL DEFAULT '',
    destination     TEXT NOT NULL DEFAULT '',
    correlation_id  TEXT NOT NULL DEFAULT '',

    -- The digest handed to the backend, and the signature that came back.
    -- Both hex. Keeping the digest is what makes a disputed signature
    -- verifiable afterwards against the public key alone.
    digest          TEXT NOT NULL,
    signature       TEXT NOT NULL DEFAULT '',

    -- ALLOWED or DENIED, with the policy's own reason. Denials are logged as
    -- carefully as approvals: a burst of refusals is the first sign of a
    -- compromised caller probing what it can get through.
    outcome         TEXT NOT NULL CHECK (outcome IN ('ALLOWED', 'DENIED', 'ERROR')),
    reason          TEXT NOT NULL DEFAULT '',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- The chain. prev_hash is the previous row's `hash`; hash is over this
    -- row's own content plus prev_hash.
    prev_hash       TEXT NOT NULL,
    hash            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signatures_correlation
    ON signatures (chain, method, correlation_id) WHERE correlation_id <> '';
CREATE INDEX IF NOT EXISTS idx_signatures_daily
    ON signatures (chain, method, created_at) WHERE outcome = 'ALLOWED';
CREATE INDEX IF NOT EXISTS idx_signatures_caller ON signatures (caller, created_at DESC);

-- ---------------------------------------------------------------------------
-- Idempotency
--
-- The plan asks for this by name: *"Idempotent on (chain, method,
-- correlation_id) — a retried mint returns the original tx hash."*
--
-- Without it, a saga retry after a timeout produces a *second valid
-- signature* for the same movement. The chain's replay guard stops the second
-- transaction landing, but the platform has now authorised the same money
-- twice, and which of the two signatures is the real one is unanswerable.
--
-- A partial unique index rather than a constraint on `signatures` itself,
-- because a denial must not consume the slot: a request refused for being
-- over a ceiling should be retryable after the ceiling is raised.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_signatures_idempotent
    ON signatures (chain, method, correlation_id)
    WHERE outcome = 'ALLOWED' AND correlation_id <> '';

-- +goose StatementBegin
-- Append-only, enforced by the database rather than by the code being
-- careful. The same trigger shape core-ledger uses on journal_entries, for
-- the same reason: the value of an audit log is exactly the confidence that
-- nothing has been taken out of it.
CREATE OR REPLACE FUNCTION signatures_are_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'signatures is append-only (attempted % on seq %); a signature record is never edited or removed',
        TG_OP, COALESCE(OLD.seq, NEW.seq);
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_signatures_append_only ON signatures;
CREATE TRIGGER trg_signatures_append_only
    BEFORE UPDATE OR DELETE ON signatures
    FOR EACH ROW EXECUTE FUNCTION signatures_are_append_only();

-- +goose Down
DROP TRIGGER IF EXISTS trg_signatures_append_only ON signatures;
DROP FUNCTION IF EXISTS signatures_are_append_only();
DROP TABLE IF EXISTS signatures;
