-- rms (reserve management / treasury) owns everything about the *backing*
-- that core-ledger deliberately does not: who holds the fiat, what they last
-- said they hold, what the platform's policy says they should hold, what it
-- charges, and what it publishes about all of that.
--
-- None of these tables hold a balance that anyone spends. The one number that
-- matters downstream — the custodian's reported balance — is POSTed to
-- core-ledger's /reserves/custodian-snapshots and lives there, because the
-- ledger is the only place value exists. What lives here is the workflow
-- state around it, which the ledger has no business storing.

CREATE TABLE IF NOT EXISTS custodians (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    currency     TEXT NOT NULL DEFAULT 'USD',

    -- provider names the CustodianProvider implementation that speaks to
    -- this custodian: 'stub' today, a real bank adapter later. The interface
    -- is the product decision (docs/building-plan.md: "No real vendor
    -- contracts — interface + stub, sandbox only where free and
    -- self-service"); the column is what makes adding one a row rather than
    -- a deploy.
    provider     TEXT NOT NULL DEFAULT 'stub',
    account_ref  TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),

    -- config is provider-specific, and for the stub it is where the
    -- demonstrable drift lives (see StubCustodianProvider): a number that
    -- makes Leg C break on demand is the difference between a control you
    -- believe in and one you hope works.
    config       JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A statement is what a custodian said, when it said it, and whether the
-- ledger has been told. The last column is the durability that makes a
-- crashed poller retry rather than skip: a missing custodian snapshot is not
-- a visible failure, it is a Leg C that silently compares against yesterday.
CREATE TABLE IF NOT EXISTS custodian_statements (
    id            TEXT PRIMARY KEY,
    custodian_id  TEXT NOT NULL REFERENCES custodians (id) ON DELETE CASCADE,
    currency      TEXT NOT NULL,

    -- Decimal string at the currency's own scale, never a float and never a
    -- number — the same discipline every amount in this platform follows.
    balance       TEXT NOT NULL,
    as_of         TIMESTAMPTZ NOT NULL,
    statement_ref TEXT NOT NULL DEFAULT '',
    source        TEXT NOT NULL DEFAULT '',

    posted_at     TIMESTAMPTZ,
    post_attempts INTEGER NOT NULL DEFAULT 0,
    last_error    TEXT NOT NULL DEFAULT '',

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (custodian_id, currency, as_of)
);

CREATE INDEX IF NOT EXISTS idx_custodian_statements_unposted
    ON custodian_statements (custodian_id, as_of) WHERE posted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_custodian_statements_latest
    ON custodian_statements (custodian_id, currency, as_of DESC);

-- Reserve targets are policy, not accounting: "keep at least 100% of
-- circulation in cash, and at least $50,000 of buffer on top". Leg B checks
-- that backing equals issuance; this is what says whether the *composition*
-- of that backing is within mandate.
CREATE TABLE IF NOT EXISTS reserve_targets (
    id               TEXT PRIMARY KEY,
    currency         TEXT NOT NULL UNIQUE,
    min_ratio_bps    INTEGER NOT NULL DEFAULT 10000 CHECK (min_ratio_bps >= 0),
    buffer_amount    TEXT NOT NULL DEFAULT '0',
    note             TEXT NOT NULL DEFAULT '',
    updated_by       TEXT NOT NULL DEFAULT '',
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fee schedules are stored here and *applied* by core-ledger's FEE_*_BPS
-- config. This table is the versioned, audited record of what the schedule
-- was on a given date — the plan's "fee bps with no audit trail" item from
-- below the risk register's line.
CREATE TABLE IF NOT EXISTS fee_schedules (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    issuance_bps    INTEGER NOT NULL DEFAULT 0 CHECK (issuance_bps BETWEEN 0 AND 10000),
    redemption_bps  INTEGER NOT NULL DEFAULT 0 CHECK (redemption_bps BETWEEN 0 AND 10000),
    transfer_bps    INTEGER NOT NULL DEFAULT 0 CHECK (transfer_bps BETWEEN 0 AND 10000),
    withdrawal_bps  INTEGER NOT NULL DEFAULT 0 CHECK (withdrawal_bps BETWEEN 0 AND 10000),
    effective_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to    TIMESTAMPTZ,
    created_by      TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fee_schedules_effective ON fee_schedules (effective_from DESC);

-- An attestation is the published claim: "as of this moment, N USD-X were in
-- circulation and $M were held against them". It is a snapshot taken from
-- core-ledger's own numbers and frozen, because the point of an attestation is
-- that it does not change when the underlying does.
CREATE TABLE IF NOT EXISTS attestations (
    id               TEXT PRIMARY KEY,
    as_of            TIMESTAMPTZ NOT NULL,
    currency         TEXT NOT NULL,
    issued           TEXT NOT NULL,
    backing          TEXT NOT NULL,
    custodian_total  TEXT NOT NULL,
    chain_supply     JSONB NOT NULL DEFAULT '{}'::jsonb,
    reconciliation_run_id TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
    published_at     TIMESTAMPTZ,
    prepared_by      TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attestations_as_of ON attestations (as_of DESC);

-- A default custodian so a fresh environment has a Leg C that evaluates
-- rather than one that is permanently skipped. Its drift starts at zero;
-- POST /custodians/primary/drift is how the demo breaks it.
INSERT INTO custodians (id, name, currency, provider, account_ref, config)
VALUES ('primary', 'Primary Trust Account', 'USD', 'stub', 'DAMP-TRUST-001',
        '{"drift": "0.00"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reserve_targets (id, currency, min_ratio_bps, buffer_amount, note)
VALUES ('target_usd', 'USD', 10000, '0',
        'Full backing: every USD-X in circulation is matched 1:1 by cash at a custodian.')
ON CONFLICT (currency) DO NOTHING;
