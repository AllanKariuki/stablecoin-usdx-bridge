-- services/kyc owns onboarding: who has proved who they are, on the strength
-- of what, and what that lets them do.
--
-- It owns no balance and freezes nothing itself. Gating happens through two
-- existing mechanisms rather than a new one:
--
--   - core-ledger's POST /wallets/:id/status, which every service already
--     handles the ACCOUNT_FROZEN 409 from;
--   - tier limits, checked before a movement is proposed.
--
-- Inventing a third would mean three places that can stop a transaction and
-- three answers to why one was stopped.

CREATE TABLE IF NOT EXISTS kyc_cases (
    id              TEXT PRIMARY KEY,
    party_id        TEXT NOT NULL,

    -- The tier being applied for, and the tier currently held. They differ
    -- while an upgrade is in flight, which is the whole reason both exist: a
    -- party at TIER_1 applying for TIER_2 keeps TIER_1's limits until the
    -- case is approved, rather than being suspended between them.
    requested_tier  TEXT NOT NULL DEFAULT 'TIER_1',

    status          TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
                        'DRAFT',              -- created, nothing submitted
                        'SUBMITTED',          -- documents in, awaiting screening
                        'SCREENING',          -- with the provider
                        'PENDING_REVIEW',     -- provider answered; a human must decide
                        'PENDING_APPROVAL',   -- decision made, waiting on maker-checker
                        'APPROVED',
                        'REJECTED',
                        'EXPIRED')),

    -- What the provider said, kept verbatim. A KYC decision is the kind of
    -- thing a regulator asks about years later, and "the provider said no"
    -- is not an answer without the response that said it.
    provider        TEXT NOT NULL DEFAULT 'stub',
    provider_ref    TEXT NOT NULL DEFAULT '',
    provider_result JSONB NOT NULL DEFAULT '{}'::jsonb,
    risk_score      INTEGER,

    -- The maker-checker request that gates approval. A case can reach
    -- PENDING_APPROVAL and sit there; it is not approved until workflow says
    -- so and the digest verifies.
    approval_request_id TEXT NOT NULL DEFAULT '',

    reviewed_by     TEXT NOT NULL DEFAULT '',
    review_notes    TEXT NOT NULL DEFAULT '',
    rejection_reason TEXT NOT NULL DEFAULT '',

    submitted_at    TIMESTAMPTZ,
    decided_at      TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One open case per party. A second application while one is in review is a
-- double-submit, and allowing it would let two reviewers reach two different
-- decisions about one person.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kyc_cases_open
    ON kyc_cases (party_id)
    WHERE status NOT IN ('APPROVED', 'REJECTED', 'EXPIRED');

CREATE INDEX IF NOT EXISTS idx_kyc_cases_party ON kyc_cases (party_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_cases_queue
    ON kyc_cases (submitted_at) WHERE status IN ('PENDING_REVIEW', 'SCREENING');

-- ---------------------------------------------------------------------------
-- Documents
--
-- The file itself goes to object storage (MinIO/S3). This table holds the
-- *reference* and the metadata, because a passport scan in a Postgres row is
-- a passport scan in every backup, every replica and every pg_dump anybody
-- has ever taken.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kyc_documents (
    id            TEXT PRIMARY KEY,
    case_id       TEXT NOT NULL REFERENCES kyc_cases (id) ON DELETE CASCADE,
    party_id      TEXT NOT NULL,

    kind          TEXT NOT NULL CHECK (kind IN (
                      'PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENCE',
                      'PROOF_OF_ADDRESS', 'SELFIE', 'COMPANY_REGISTRATION', 'OTHER')),

    -- The object key, never a URL: a stored URL embeds the bucket's hostname
    -- and access model, and both change. Presigned URLs are minted on read.
    storage_key   TEXT NOT NULL,
    content_type  TEXT NOT NULL DEFAULT 'application/octet-stream',
    size_bytes    BIGINT NOT NULL DEFAULT 0,

    -- SHA-256 of the file. Two purposes: detecting the same document
    -- submitted under two identities, and proving years later that the file
    -- in storage is the file that was reviewed.
    sha256        TEXT NOT NULL DEFAULT '',

    status        TEXT NOT NULL DEFAULT 'UPLOADED'
                  CHECK (status IN ('UPLOADED', 'ACCEPTED', 'REJECTED')),
    reject_reason TEXT NOT NULL DEFAULT '',

    uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kyc_documents_case ON kyc_documents (case_id);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_hash ON kyc_documents (sha256) WHERE sha256 <> '';

-- ---------------------------------------------------------------------------
-- Tiers
--
-- A tier is a set of limits. Limits are decimal strings at the currency's own
-- scale, like every amount in this platform — a limit stored as a float is a
-- limit that is occasionally off by a cent in the customer's favour and
-- occasionally in theirs.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kyc_tiers (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL UNIQUE,
    rank              INTEGER NOT NULL UNIQUE,
    description       TEXT NOT NULL DEFAULT '',

    currency          TEXT NOT NULL DEFAULT 'USD',
    daily_limit       TEXT NOT NULL,
    monthly_limit     TEXT NOT NULL,
    single_tx_limit   TEXT NOT NULL,

    -- What this tier is allowed to do at all, independent of amount.
    can_deposit       BOOLEAN NOT NULL DEFAULT FALSE,
    can_withdraw      BOOLEAN NOT NULL DEFAULT FALSE,
    can_issue         BOOLEAN NOT NULL DEFAULT FALSE,
    can_bridge        BOOLEAN NOT NULL DEFAULT FALSE,

    required_documents TEXT[] NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The tier a party currently holds. Separate from kyc_cases because a tier
-- outlives the case that granted it, and because a party can be downgraded
-- (a document expired, a screening hit) without a new case existing yet.
CREATE TABLE IF NOT EXISTS party_tiers (
    party_id     TEXT PRIMARY KEY,
    tier         TEXT NOT NULL REFERENCES kyc_tiers (name),
    granted_by   TEXT NOT NULL DEFAULT '',
    case_id      TEXT,
    granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every tier change, forever. An auditor's question is never "what tier are
-- they" but "what tier were they on the day of that transaction".
CREATE TABLE IF NOT EXISTS tier_history (
    id          TEXT PRIMARY KEY,
    party_id    TEXT NOT NULL,
    from_tier   TEXT NOT NULL DEFAULT '',
    to_tier     TEXT NOT NULL,
    reason      TEXT NOT NULL DEFAULT '',
    changed_by  TEXT NOT NULL DEFAULT '',
    case_id     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tier_history_party ON tier_history (party_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Seed tiers
--
-- TIER_0 exists and can do nothing. That is the point of the plan's DoD: *a
-- stranger signs up, submits KYC, is auto-screened, reviewed and approved —
-- and only then can deposit.* A default tier that could deposit would make
-- the KYC gate decorative.
-- ---------------------------------------------------------------------------
INSERT INTO kyc_tiers (id, name, rank, description, daily_limit, monthly_limit, single_tx_limit,
                       can_deposit, can_withdraw, can_issue, can_bridge, required_documents) VALUES
    ('tier_0', 'TIER_0', 0,
     'Unverified. Can sign in and look around, and nothing else.',
     '0.00', '0.00', '0.00', FALSE, FALSE, FALSE, FALSE, '{}'),

    ('tier_1', 'TIER_1', 1,
     'Identity verified. Everyday limits.',
     '1000.00', '10000.00', '1000.00', TRUE, TRUE, TRUE, TRUE,
     ARRAY['PASSPORT', 'SELFIE']),

    ('tier_2', 'TIER_2', 2,
     'Identity and address verified.',
     '25000.00', '100000.00', '10000.00', TRUE, TRUE, TRUE, TRUE,
     ARRAY['PASSPORT', 'SELFIE', 'PROOF_OF_ADDRESS']),

    ('tier_3', 'TIER_3', 3,
     'Enhanced due diligence. Corporate and high-value.',
     '1000000.00', '10000000.00', '500000.00', TRUE, TRUE, TRUE, TRUE,
     ARRAY['COMPANY_REGISTRATION', 'PROOF_OF_ADDRESS', 'PASSPORT'])
ON CONFLICT (name) DO NOTHING;
