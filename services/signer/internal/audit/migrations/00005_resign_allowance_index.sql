-- +goose Up

-- 00004 introduced grant records (method 'resign-allowance') into
-- signatures. 00002's idempotency index — unique on (chain, method,
-- correlation_id, digest) for ALLOWED rows — was built for signatures, and
-- a correlation may legitimately carry several grant rows over its life
-- (a grant, its expiry, a later grant). The active-grant rule is the
-- resign_allowances table's own primary key; the chain must accept the
-- grant history, not collide on it. The index is narrowed to exclude
-- resign-allowance rows — signing idempotency (unique per correlation per
-- exact bytes, since 00002) is untouched.
DROP INDEX IF EXISTS uq_signatures_idempotent;
CREATE UNIQUE INDEX uq_signatures_idempotent
    ON signatures (chain, method, correlation_id, digest)
    WHERE outcome = 'ALLOWED' AND correlation_id <> '' AND method <> 'resign-allowance';

-- +goose Down
DROP INDEX IF EXISTS uq_signatures_idempotent;
CREATE UNIQUE INDEX uq_signatures_idempotent
    ON signatures (chain, method, correlation_id, digest)
    WHERE outcome = 'ALLOWED' AND correlation_id <> '';
