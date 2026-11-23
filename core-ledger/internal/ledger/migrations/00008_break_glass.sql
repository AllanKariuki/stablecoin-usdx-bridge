-- +goose Up

-- H4: break-glass redemption confirm becomes maker-checker.
--
-- POST /redemptions/:id/confirm no longer settles anything. It opens an
-- approval request in services/workflow and records the proposal here, so the
-- decision callback can find what it is deciding about — the hash, the reason
-- and who asked. Nothing in this table authorizes a settlement on its own:
-- the callback re-verifies the workflow decision (HMAC + digest + request id)
-- and the burn itself on chain before the ledger moves.
--
-- The partial unique index enforces one PENDING proposal per redemption: a
-- second confirm while one is awaiting approval is a mistake — usually a
-- double-submit — and allowing it would mean two approvers each approving
-- "the" break-glass for one payout. A terminal row (APPROVED_VERIFIED,
-- REJECTED, VERIFICATION_FAILED) leaves the index, so a failed or refused
-- proposal can be re-made.

CREATE TABLE IF NOT EXISTS break_glass_requests (
    id                  TEXT PRIMARY KEY,
    transaction_id      TEXT NOT NULL,
    chain_tx_hash       TEXT NOT NULL,
    reason              TEXT NOT NULL,
    requested_by        TEXT NOT NULL,
    workflow_request_id TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'APPROVED_VERIFIED', 'REJECTED', 'VERIFICATION_FAILED')),
    failure_reason      TEXT NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_break_glass_pending
    ON break_glass_requests (transaction_id) WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_break_glass_workflow_request
    ON break_glass_requests (workflow_request_id) WHERE workflow_request_id <> '';

-- +goose Down
DROP TABLE IF EXISTS break_glass_requests;
