-- services/reporting owns report *definitions* and *runs*. It owns no
-- numbers: every figure in every report is read from the service that owns
-- it at the moment the run executes, and frozen into the run's output.
--
-- That freezing is the whole point of a run being a row. A trial balance
-- regenerated on demand gives a different answer every time somebody opens
-- it, which is useless as a record — "the trial balance we filed on the 3rd"
-- has to still say what it said on the 3rd.

CREATE TABLE IF NOT EXISTS report_definitions (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    description  TEXT NOT NULL DEFAULT '',

    -- Which built-in report this is. A fixed vocabulary rather than a query
    -- somebody types: a reporting service that runs arbitrary SQL against
    -- other services' databases is a reporting service that has bypassed
    -- every boundary this platform has.
    kind         TEXT NOT NULL CHECK (kind IN (
                     'TRIAL_BALANCE',
                     'WALLET_STATEMENT',
                     'RECONCILIATION_PACK',
                     'RESERVE_ATTESTATION',
                     'TRANSACTION_REGISTER',
                     'AUDIT_EXTRACT')),

    -- Defaults for the run's parameters, overridable per run.
    params       JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Which permission a caller needs. Read from the definition rather than
    -- hardcoded per route, so adding a report does not mean editing the
    -- gateway's table — and so a report that exposes more than its siblings
    -- can say so.
    required_permission TEXT NOT NULL DEFAULT 'reports:read',

    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_runs (
    id            TEXT PRIMARY KEY,
    definition_id TEXT NOT NULL REFERENCES report_definitions (id),
    kind          TEXT NOT NULL,

    params        JSONB NOT NULL DEFAULT '{}'::jsonb,
    requested_by  TEXT NOT NULL,

    status        TEXT NOT NULL DEFAULT 'RUNNING'
                  CHECK (status IN ('RUNNING', 'COMPLETE', 'FAILED')),

    -- The frozen result. Stored rather than regenerated, because a report is
    -- a record of what was true when it ran.
    result        JSONB,
    row_count     INTEGER NOT NULL DEFAULT 0,
    error         TEXT NOT NULL DEFAULT '',

    -- SHA-256 of the canonical result, so a downloaded CSV can be proved to
    -- match the run it claims to come from.
    result_hash   TEXT NOT NULL DEFAULT '',

    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_report_runs_definition ON report_runs (definition_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_runs_requester  ON report_runs (requested_by, started_at DESC);

-- The built-in reports.
INSERT INTO report_definitions (id, name, kind, description, required_permission) VALUES
    ('rpt_trial_balance', 'Trial balance', 'TRIAL_BALANCE',
     'Every GL account''s debits, credits and balance for a currency, with the balanced check.',
     'ledger:read'),

    ('rpt_statement', 'Wallet statement', 'WALLET_STATEMENT',
     'One wallet''s entries with running balances over a date range.',
     'reports:read'),

    ('rpt_recon_pack', 'Reconciliation pack', 'RECONCILIATION_PACK',
     'The three legs, the inputs they were computed from, and every break opened or resolved in the period.',
     'reports:read'),

    ('rpt_attestation', 'Reserve attestation', 'RESERVE_ATTESTATION',
     'What was in circulation and what was held against it, as of a moment.',
     'reports:read'),

    ('rpt_register', 'Transaction register', 'TRANSACTION_REGISTER',
     'Every journal transaction in a period, with its entity back-reference.',
     'transactions:read:any'),

    ('rpt_audit', 'Audit extract', 'AUDIT_EXTRACT',
     'Actor events from services/audit-trail, with their chain hashes and anchor status.',
     'reports:read')
ON CONFLICT (name) DO NOTHING;
