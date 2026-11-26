-- H6: enforcement actions gain the SUBMITTED status.
--
-- core-ledger's POST /chain/enforcement is now durable + async: it broadcasts
-- the transaction and answers 202, and compliance records SUBMITTED (with the
-- tx hash) until core-ledger's outbox event
-- damp.ledger.chain_enforcement_finalized.v1 delivers the FINAL or FAILED
-- outcome. The old status set had no state between APPROVED and EXECUTED —
-- which is exactly the gap the synchronous design collapsed into.

ALTER TABLE enforcement_actions
    DROP CONSTRAINT IF EXISTS enforcement_actions_status_check;

ALTER TABLE enforcement_actions
    ADD CONSTRAINT enforcement_actions_status_check
    CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'SUBMITTED', 'EXECUTING', 'EXECUTED', 'FAILED', 'REJECTED'));
