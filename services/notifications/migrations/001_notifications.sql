-- services/notifications is where every other service's "tell the customer"
-- ends up, and where reconciliation's alert() finally reaches a human.
--
-- It owns four things: what a message should say (templates), who wants to
-- hear about what (preferences), what was actually sent (delivery log), and
-- who else wants to be told programmatically (webhooks).
--
-- It owns no balance and makes no decisions about money. Its worst failure
-- mode is a message nobody receives — which is why every producer calls it
-- best-effort and the durable path for anything that must not be lost is
-- core-ledger's transactional outbox, which this service also consumes.

-- ---------------------------------------------------------------------------
-- Templates
--
-- Stored rather than compiled in, because the text of a notification is the
-- part most likely to change for non-engineering reasons — a compliance
-- rewording, a translation — and a deploy for a comma is a deploy nobody
-- does, which is how a platform ends up with wrong wording in production.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS templates (
    id          TEXT PRIMARY KEY,
    event       TEXT NOT NULL,
    channel     TEXT NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL', 'WEBHOOK')),
    locale      TEXT NOT NULL DEFAULT 'en',

    subject     TEXT NOT NULL DEFAULT '',
    body        TEXT NOT NULL,

    -- Severity drives how the UI renders it and whether the in-app toast is
    -- dismissible. It is a property of the template rather than the event so
    -- the same event can be informational to a customer and critical to an
    -- operator.
    severity    TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'critical')),
    active      BOOLEAN NOT NULL DEFAULT TRUE,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event, channel, locale)
);

-- ---------------------------------------------------------------------------
-- Preferences
--
-- Absence means "send it": a customer who has never touched their settings
-- should still be told their money arrived. Only an explicit row turns
-- something off, which is why there is no default-populated preferences row
-- per party.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS preferences (
    party_id    TEXT NOT NULL,
    event       TEXT NOT NULL,
    channel     TEXT NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (party_id, event, channel)
);

-- ---------------------------------------------------------------------------
-- Delivery log
--
-- One row per attempt to reach one party on one channel. It is the answer to
-- "did they know", which in a dispute is a different question from "did it
-- happen" and is answered by a different system.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS deliveries (
    id            TEXT PRIMARY KEY,
    party_id      TEXT NOT NULL,
    event         TEXT NOT NULL,
    channel       TEXT NOT NULL,

    subject       TEXT NOT NULL DEFAULT '',
    body          TEXT NOT NULL DEFAULT '',
    severity      TEXT NOT NULL DEFAULT 'info',
    payload       JSONB NOT NULL DEFAULT '{}'::jsonb,

    status        TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED')),
    failure_reason TEXT NOT NULL DEFAULT '',

    -- Set when a customer opens it in-app. Nullable forever for channels
    -- where reading cannot be observed.
    read_at       TIMESTAMPTZ,

    -- The producer's own idempotency key. An outbox is at-least-once by
    -- design, so the same event arrives more than once as a matter of
    -- routine, and a customer being told twice that their money arrived is a
    -- support ticket.
    dedupe_key    TEXT UNIQUE,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deliveries_party  ON deliveries (party_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_unread ON deliveries (party_id) WHERE read_at IS NULL AND channel = 'IN_APP';

-- ---------------------------------------------------------------------------
-- Outbound webhooks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id          TEXT PRIMARY KEY,
    party_id    TEXT NOT NULL,
    url         TEXT NOT NULL,

    -- The HMAC key. Generated here and shown to the subscriber exactly once:
    -- a signing secret that can be re-read from an API is a signing secret
    -- that proves nothing, because anyone who can read it can forge the
    -- signature.
    secret      TEXT NOT NULL,

    -- Empty means every event. A subscriber that wants everything shouldn't
    -- have to enumerate a list that grows.
    events      TEXT[] NOT NULL DEFAULT '{}',

    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    consecutive_failures INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_party ON webhook_endpoints (party_id) WHERE active;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id            TEXT PRIMARY KEY,
    endpoint_id   TEXT NOT NULL REFERENCES webhook_endpoints (id) ON DELETE CASCADE,
    event         TEXT NOT NULL,
    payload       JSONB NOT NULL,

    status        TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'DELIVERED', 'FAILED', 'DEAD')),
    attempts      INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    response_status INTEGER,
    last_error    TEXT NOT NULL DEFAULT '',

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due
    ON webhook_deliveries (next_attempt_at) WHERE status = 'PENDING';

-- ---------------------------------------------------------------------------
-- Seed templates
--
-- `{{placeholder}}` substitution only — no expressions, no logic. A template
-- language in a notification service is a template language somebody
-- eventually puts a loop in, and then the rendering of a message can fail at
-- runtime in a way nobody tested.
-- ---------------------------------------------------------------------------

INSERT INTO templates (id, event, channel, subject, body, severity) VALUES
    ('tpl_payment_settled_inapp', 'payment.settled', 'IN_APP', 'Payment complete',
     '{{direction}} of {{amount}} {{currency}} completed.', 'success'),
    ('tpl_payment_settled_email', 'payment.settled', 'EMAIL', 'Your {{direction}} of {{amount}} {{currency}} is complete',
     E'Hello,\n\nYour {{direction}} of {{amount}} {{currency}} has completed.\n\nReference: {{intentId}}\nLedger transaction: {{ledgerTxId}}\n\n— DAMP', 'success'),

    ('tpl_payment_failed_inapp', 'payment.failed', 'IN_APP', 'Payment failed',
     '{{direction}} of {{amount}} {{currency}} could not be completed: {{reason}}', 'warning'),
    ('tpl_payment_failed_email', 'payment.failed', 'EMAIL', 'Your {{direction}} could not be completed',
     E'Hello,\n\nYour {{direction}} of {{amount}} {{currency}} could not be completed.\n\nReason: {{reason}}\nReference: {{intentId}}\n\nNo money has left your account.\n\n— DAMP', 'warning'),

    ('tpl_invoice_issued_inapp', 'invoice.issued', 'IN_APP', 'New invoice',
     'Invoice {{number}} for {{amount}} {{currency}} is ready to pay.', 'info'),
    ('tpl_invoice_issued_email', 'invoice.issued', 'EMAIL', 'Invoice {{number}} — {{amount}} {{currency}}',
     E'Hello,\n\nInvoice {{number}} for {{amount}} {{currency}} is ready.\n\nPay it here: {{payLink}}\n\n— DAMP', 'info'),

    -- The ledger's own events, consumed from the transactional outbox.
    ('tpl_tx_posted_inapp', 'damp.ledger.transaction_posted.v1', 'IN_APP', 'Account activity',
     '{{type}} posted: {{description}}', 'info'),

    -- Where reconciliation's alert() finally reaches a human. This is the
    -- template that makes R7's "the one control catching an unbacked mint is
    -- decorative" stop being true.
    ('tpl_recon_break_inapp', 'damp.reserves.reconciliation_break_opened.v1', 'IN_APP',
     'Reconciliation break: {{leg}}',
     '{{leg}} / {{code}} opened. Drift {{drift}}. {{detail}}', 'critical'),
    ('tpl_recon_break_email', 'damp.reserves.reconciliation_break_opened.v1', 'EMAIL',
     '[{{severity}}] DAMP reconciliation break: {{leg}} / {{code}}',
     E'A reconciliation break has opened.\n\nLeg: {{leg}}\nCode: {{code}}\nDrift: {{drift}}\nDetail: {{detail}}\nOpened: {{opened_at}}\n\nRunbook: docs/runbooks/\n\n— DAMP', 'critical'),
    ('tpl_recon_resolved_inapp', 'damp.reserves.reconciliation_break_resolved.v1', 'IN_APP',
     'Reconciliation break resolved',
     '{{leg}} / {{code}} resolved after {{observations}} observations.', 'success')
ON CONFLICT (event, channel, locale) DO NOTHING;
