-- Webhook deliveries dedupe on the producer's event id, as `deliveries`
-- already did.
--
-- Both producers that reach this service durably — core-ledger's outbox and,
-- as of this migration, payments' — are at-least-once, so the same event
-- arriving twice is routine. `deliveries.dedupe_key` already stopped the
-- customer being emailed twice, but the webhook fan-out behind it had no key,
-- and every replay queued another signed POST to each subscriber.
--
-- Per endpoint, not global: one event legitimately produces one delivery per
-- subscribed endpoint. NULL (an event with no producer key) never conflicts,
-- which keeps the pre-existing best-effort callers working unchanged.

ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_deliveries_dedupe
    ON webhook_deliveries (endpoint_id, dedupe_key);
