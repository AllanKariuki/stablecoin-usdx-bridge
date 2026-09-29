-- services/compliance watches money move and decides whether it should have.
--
-- It consumes `damp.ledger.transaction_posted.v1` from core-ledger's
-- transactional outbox — which means it sees every posting, in commit order,
-- with no possibility of a transaction the ledger accepted and compliance
-- never heard about. That property is the reason the outbox was built in P2
-- before there was anything to publish to.
--
-- It owns no balance and stops nothing by itself. Blocking happens through
-- core-ledger's wallet status and the contract's own blacklist/pause, both of
-- which already exist and both of which go through maker-checker.

-- ---------------------------------------------------------------------------
-- Screening
--
-- A counterparty, screened against whatever provider a deployment has. The
-- result is cached because screening the same address on every transfer is
-- both slow and, with a real vendor, expensive — and because a sanctions
-- list does not change between two transfers a second apart.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS screenings (
    id            TEXT PRIMARY KEY,

    -- What was screened: a party, an on-chain address, a bank account.
    subject_type  TEXT NOT NULL CHECK (subject_type IN ('PARTY', 'ADDRESS', 'BANK_ACCOUNT')),
    subject       TEXT NOT NULL,

    provider      TEXT NOT NULL DEFAULT 'stub',
    outcome       TEXT NOT NULL CHECK (outcome IN ('CLEAR', 'REVIEW', 'BLOCK')),
    risk_score    INTEGER NOT NULL DEFAULT 0,
    matches       JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw           JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Cached results expire. A clear screen from six months ago is not
    -- evidence that somebody is not on today's list.
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_screenings_subject
    ON screenings (subject_type, subject, created_at DESC);

-- ---------------------------------------------------------------------------
-- Rules
--
-- Deliberately a small, fixed vocabulary of rule kinds rather than an
-- expression language. A compliance service with a scripting engine is a
-- compliance service where a rule can throw at evaluation time — on the path
-- that decides whether a transaction is allowed — and where "what do our
-- rules actually say" has no answer short of reading code.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS risk_rules (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    description   TEXT NOT NULL DEFAULT '',

    kind          TEXT NOT NULL CHECK (kind IN (
                      'AMOUNT_THRESHOLD',    -- a single transaction over a limit
                      'VELOCITY',            -- N transactions in a window
                      'AGGREGATE_WINDOW',    -- total value in a window
                      'SANCTIONED_COUNTERPARTY',
                      'NEW_PARTY_LARGE_TX',  -- a big first move
                      'STRUCTURING')),       -- repeated amounts just under a threshold

    -- Kind-specific parameters. JSONB rather than columns because the kinds
    -- genuinely differ, and a table with amount_threshold, window_minutes,
    -- count_threshold and six nullable columns describes none of them well.
    params        JSONB NOT NULL DEFAULT '{}'::jsonb,

    severity      TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),

    -- What firing does. FLAG records and moves on; REVIEW opens a case;
    -- BLOCK freezes. Separating them is what lets a rule be turned on in
    -- observation mode first — the only responsible way to deploy a rule
    -- that can freeze a customer's money.
    action        TEXT NOT NULL DEFAULT 'FLAG' CHECK (action IN ('FLAG', 'REVIEW', 'BLOCK')),

    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Movements
--
-- A local copy of what the ledger already knows about postings against
-- customer wallets, kept for one reason: rules look back over a window, and
-- doing that with a cross-service query on every posting would put
-- core-ledger in the hot path of its own event consumer.
--
-- It is a cache of *history*, never a source of truth about value. Nothing
-- here is ever summed to produce a balance — the journal is the only place a
-- balance comes from — and a divergence between this table and the ledger
-- costs an inaccurate rule evaluation, not an inaccurate balance.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS movements (
    transaction_id TEXT NOT NULL,
    party_id       TEXT NOT NULL,
    type           TEXT NOT NULL DEFAULT '',
    amount         TEXT NOT NULL,
    currency       TEXT NOT NULL,
    counterparty   TEXT NOT NULL DEFAULT '',
    posted_at      TIMESTAMPTZ NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- The amount is in the key because one transaction can post more than one
    -- line against the same party's wallets (an FX conversion debits one and
    -- credits another), and both are movements a rule should see.
    PRIMARY KEY (transaction_id, party_id, amount)
);

CREATE INDEX IF NOT EXISTS idx_movements_party_window ON movements (party_id, posted_at DESC);

-- ---------------------------------------------------------------------------
-- Alerts and cases
--
-- An alert is "a rule fired". A case is "somebody is looking into it". They
-- are separate because one case routinely covers many alerts — the same
-- party tripping a velocity rule eleven times is one investigation — and
-- because an alert is immutable evidence while a case has a workflow.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alerts (
    id              TEXT PRIMARY KEY,
    rule_id         TEXT NOT NULL REFERENCES risk_rules (id),
    rule_name       TEXT NOT NULL,

    party_id        TEXT NOT NULL DEFAULT '',
    transaction_id  TEXT NOT NULL DEFAULT '',
    subject         TEXT NOT NULL DEFAULT '',

    severity        TEXT NOT NULL,
    detail          TEXT NOT NULL DEFAULT '',
    -- Everything the rule saw when it fired. An alert re-examined a year
    -- later must be explicable without re-running the rule against data that
    -- has since changed.
    evidence        JSONB NOT NULL DEFAULT '{}'::jsonb,

    case_id         TEXT,
    status          TEXT NOT NULL DEFAULT 'OPEN'
                    CHECK (status IN ('OPEN', 'IN_CASE', 'DISMISSED')),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One alert per (rule, transaction). Re-delivery of the same ledger event
    -- — which the outbox guarantees will happen — must not multiply alerts.
    UNIQUE (rule_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_open ON alerts (created_at DESC) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_alerts_party ON alerts (party_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cases (
    id            TEXT PRIMARY KEY,
    reference     TEXT NOT NULL UNIQUE,
    party_id      TEXT NOT NULL,

    status        TEXT NOT NULL DEFAULT 'OPEN'
                  CHECK (status IN ('OPEN', 'INVESTIGATING', 'ESCALATED', 'CLOSED_CLEARED', 'CLOSED_SAR')),
    severity      TEXT NOT NULL DEFAULT 'medium',

    title         TEXT NOT NULL,
    summary       TEXT NOT NULL DEFAULT '',
    assigned_to   TEXT NOT NULL DEFAULT '',

    -- Set when the case ends in a SAR. A filed report is a legal document,
    -- so the narrative is stored verbatim rather than regenerated.
    sar_narrative TEXT NOT NULL DEFAULT '',
    sar_filed_at  TIMESTAMPTZ,
    sar_reference TEXT NOT NULL DEFAULT '',

    closed_at     TIMESTAMPTZ,
    closed_by     TEXT NOT NULL DEFAULT '',
    closing_notes TEXT NOT NULL DEFAULT '',

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cases_open ON cases (created_at DESC) WHERE status NOT LIKE 'CLOSED%';
CREATE INDEX IF NOT EXISTS idx_cases_party ON cases (party_id);

-- Append-only. A case note is contemporaneous evidence of what an
-- investigator knew and when; an editable one is worth nothing in a
-- regulatory review.
CREATE TABLE IF NOT EXISTS case_notes (
    id          TEXT PRIMARY KEY,
    case_id     TEXT NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
    author      TEXT NOT NULL,
    note        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_notes_case ON case_notes (case_id, created_at);

-- ---------------------------------------------------------------------------
-- On-chain enforcement
--
-- COMPLIANCE_ROLE and PAUSER_ROLE have existed on the contract since it was
-- deployed with no caller. This is the caller — and every row here goes
-- through maker-checker first, because blacklisting freezes somebody's tokens
-- and pausing halts every transfer on the chain.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS enforcement_actions (
    id            TEXT PRIMARY KEY,
    kind          TEXT NOT NULL CHECK (kind IN ('BLACKLIST', 'UNBLACKLIST', 'PAUSE', 'UNPAUSE', 'FREEZE_WALLET', 'UNFREEZE_WALLET')),
    chain         TEXT NOT NULL DEFAULT '',
    target        TEXT NOT NULL DEFAULT '',
    party_id      TEXT NOT NULL DEFAULT '',
    case_id       TEXT REFERENCES cases (id),

    reason        TEXT NOT NULL,
    requested_by  TEXT NOT NULL,

    approval_request_id TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'PENDING_APPROVAL'
                  CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'EXECUTING', 'EXECUTED', 'FAILED', 'REJECTED')),

    chain_tx_hash TEXT NOT NULL DEFAULT '',
    failure_reason TEXT NOT NULL DEFAULT '',

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    executed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_enforcement_pending
    ON enforcement_actions (created_at) WHERE status IN ('PENDING_APPROVAL', 'APPROVED');

-- ---------------------------------------------------------------------------
-- Seed rules
--
-- Every one ships as FLAG or REVIEW. None ships as BLOCK, deliberately: a
-- rule that can freeze a customer's money on the day it is deployed has never
-- been observed against real traffic, and the false-positive rate of an
-- unobserved rule is unknown by definition.
-- ---------------------------------------------------------------------------

INSERT INTO risk_rules (id, name, description, kind, params, severity, action) VALUES
    ('rule_large_tx', 'Large single transaction',
     'A single movement at or above the reporting threshold.',
     'AMOUNT_THRESHOLD', '{"currency":"USD","threshold":"10000.00"}'::jsonb, 'medium', 'REVIEW'),

    ('rule_velocity', 'High transaction velocity',
     'More movements in a short window than ordinary use produces.',
     'VELOCITY', '{"count":20,"windowMinutes":60}'::jsonb, 'medium', 'FLAG'),

    ('rule_aggregate', 'Large aggregate over 24h',
     'Total value moved in a day, which a series of small transfers can reach without any one of them tripping a threshold.',
     'AGGREGATE_WINDOW', '{"currency":"USD","threshold":"50000.00","windowMinutes":1440}'::jsonb, 'high', 'REVIEW'),

    ('rule_structuring', 'Possible structuring',
     'Repeated amounts just below the reporting threshold — the pattern thresholds create.',
     'STRUCTURING', '{"currency":"USD","threshold":"10000.00","marginPct":10,"count":3,"windowMinutes":1440}'::jsonb,
     'high', 'REVIEW'),

    ('rule_new_party_large', 'Large transaction from a new party',
     'A significant first movement, before any pattern exists to compare against.',
     'NEW_PARTY_LARGE_TX', '{"currency":"USD","threshold":"5000.00","accountAgeHours":24}'::jsonb, 'high', 'REVIEW'),

    ('rule_sanctioned', 'Sanctioned counterparty',
     'A screening hit on the other side of a movement.',
     'SANCTIONED_COUNTERPARTY', '{}'::jsonb, 'critical', 'REVIEW')
ON CONFLICT (name) DO NOTHING;
