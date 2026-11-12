-- A delivery row left PENDING by a crash is retried rather than stranded.
--
-- The row is written before the send, on purpose (see DeliveryService), so a
-- process that dies between the two leaves a PENDING row behind. Before this
-- migration a replay of that event collided on dedupe_key, was treated as an
-- ordinary duplicate and skipped — so the one notification the crash
-- interrupted was the one notification nobody ever retried.
--
-- claimed_at is a lease: when somebody last took the row to send it. A
-- PENDING row whose lease is older than the longest a send can take was
-- abandoned, and a replay or the sweeper may take it again. attempts bounds
-- that, so a message that kills the process on every send does not kill it
-- forever.

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS attempts   INTEGER NOT NULL DEFAULT 0;

-- Existing rows: the lease began when the row was written. Anything already
-- stranded becomes visible to the sweeper, which either retries it or — past
-- its horizon — marks it FAILED rather than sending a week-old message.
UPDATE deliveries SET claimed_at = created_at, attempts = 1 WHERE claimed_at IS NULL;

ALTER TABLE deliveries ALTER COLUMN claimed_at SET DEFAULT now();
ALTER TABLE deliveries ALTER COLUMN claimed_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deliveries_pending
    ON deliveries (claimed_at) WHERE status = 'PENDING';
