-- +goose Up

-- ---------------------------------------------------------------------------
-- Idempotency by payload, not by bytes
--
-- 00001 made (chain, method, correlation_id) unique among ALLOWED rows and
-- refused any second request under a correlation id whose bytes differed.
-- That is right for a *different movement* and wrong for a *retry*: a saga
-- retry rebuilds its transaction, and on Solana a fresh blockhash alone
-- changes the bytes — so a signed attempt that never landed left the saga
-- unable to get a signature for its next attempt, and it dead-lettered.
--
-- payload_digest is a hash of what the transaction authorises (chain, method,
-- contract/program, mint, amount, destination, on-chain correlation id),
-- without nonce, gas or blockhash. A correlation id is now bound to one
-- payload: the same payload may be re-signed as new bytes, because the
-- chain's replay guard on the on-chain id (which the signer now verifies is
-- this correlation id) lets at most one of them land. A different payload is
-- refused, exactly as before.
--
-- Empty on rows written before this migration. hashOf leaves an empty value
-- out of the chain hash, so those rows still verify.
-- ---------------------------------------------------------------------------

ALTER TABLE signatures ADD COLUMN IF NOT EXISTS payload_digest TEXT NOT NULL DEFAULT '';

-- Still unique on the exact bytes, so one transaction is never recorded as
-- signed twice. The one-payload-per-correlation rule cannot be a unique index
-- (several rows legitimately share it); it is checked inside Append's
-- SERIALIZABLE transaction instead.
DROP INDEX IF EXISTS uq_signatures_idempotent;
CREATE UNIQUE INDEX IF NOT EXISTS uq_signatures_idempotent
    ON signatures (chain, method, correlation_id, digest)
    WHERE outcome = 'ALLOWED' AND correlation_id <> '';

-- +goose Down
-- Fails if a correlation id has been re-signed since the Up, which is the
-- point: going back would make those rows violate the stricter index. Note
-- also that rows written since the Up carry payload_digest in their chain
-- hash, so dropping the column makes them unverifiable — a Down here is for
-- a database that has signed nothing since.
DROP INDEX IF EXISTS uq_signatures_idempotent;
CREATE UNIQUE INDEX IF NOT EXISTS uq_signatures_idempotent
    ON signatures (chain, method, correlation_id)
    WHERE outcome = 'ALLOWED' AND correlation_id <> '';
ALTER TABLE signatures DROP COLUMN IF EXISTS payload_digest;
