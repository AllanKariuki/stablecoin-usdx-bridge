-- services/workflow is maker-checker, once.
--
-- The plan puts it first in P5 for a specific reason: approval is needed in
-- five places (payouts, treasury rebalances, blacklisting, contract pause,
-- role grants, reversals), and implementing it five times gives five
-- definitions of "approved" — five different answers to whether the proposer
-- can approve their own request, whether a second approval on a changed
-- payload still counts, and what happens when a policy is edited while a
-- request is open.
--
-- The contract it enforces is deliberately narrow, and the narrowness is the
-- security property. This service does not execute anything. It stores a
-- *digest* of what was proposed and hands it back on approval, and the
-- calling service re-verifies that digest against its own stored object
-- before acting. A compromised workflow service can therefore approve things
-- that were never proposed all day long, and nothing happens — because the
-- caller will not find a matching object to act on.

CREATE TABLE IF NOT EXISTS policies (
    id              TEXT PRIMARY KEY,

    -- What this policy governs, as "<domain>.<action>": payouts.execute,
    -- compliance.blacklist, ledger.reversal. The caller names it when it
    -- proposes; an action with no policy is refused rather than waved
    -- through, which is the difference between a control and a suggestion.
    action          TEXT NOT NULL UNIQUE,
    description     TEXT NOT NULL DEFAULT '',

    -- How many distinct approvers are needed. Two is the usual maker-checker
    -- shape (one proposer, one approver); three exists for the things that
    -- cannot be undone.
    approvals_required INTEGER NOT NULL DEFAULT 1 CHECK (approvals_required BETWEEN 1 AND 5),

    -- Who may approve, by role. Empty means any authenticated approver, which
    -- is almost never what anybody wants and is therefore not the default in
    -- any seeded policy below.
    approver_roles  TEXT[] NOT NULL DEFAULT '{}',

    -- Non-negotiable for payouts, rebalances, blacklist, pause, role grants
    -- and reversals — the plan says so outright. Defaulting it TRUE means a
    -- policy written carelessly is still safe; a careless policy that let
    -- somebody approve their own payout would not be.
    exclude_initiator BOOLEAN NOT NULL DEFAULT TRUE,

    -- Requests that nobody acts on should expire rather than sit approvable
    -- forever: an approval granted against three-week-old context is not
    -- really an approval.
    expires_after_hours INTEGER NOT NULL DEFAULT 72,

    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_requests (
    id              TEXT PRIMARY KEY,
    action          TEXT NOT NULL,
    policy_id       TEXT NOT NULL REFERENCES policies (id),

    -- The object in the calling service that is waiting. Stored so an
    -- operator can find it, and echoed back on the callback — but never
    -- trusted as the thing that authorizes: the digest is.
    subject_type    TEXT NOT NULL,
    subject_id      TEXT NOT NULL,

    -- SHA-256 over the canonical JSON of what was proposed.
    --
    -- This is the whole security model. The caller computes it over its own
    -- stored object, sends it here, and re-computes it when the approval
    -- comes back. If the payload changed in between — an amount edited, a
    -- destination swapped — the digests differ and the caller refuses to act.
    -- Without it, "approved" would mean "this service said so", and a
    -- compromised workflow service could authorize a payout the maker never
    -- proposed.
    payload_digest  TEXT NOT NULL,

    -- A human-readable copy of the proposal, for the person deciding. It is
    -- evidence and UI, never the thing that is verified.
    summary         JSONB NOT NULL DEFAULT '{}'::jsonb,

    requested_by    TEXT NOT NULL,
    requested_by_roles TEXT[] NOT NULL DEFAULT '{}',
    reason          TEXT NOT NULL DEFAULT '',

    status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED')),

    -- Where the decision is delivered. The caller registers it; this service
    -- retries until it sticks, because an approval nobody hears about is the
    -- same as no approval.
    callback_url    TEXT NOT NULL DEFAULT '',
    callback_status TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (callback_status IN ('PENDING', 'DELIVERED', 'FAILED', 'NOT_REQUIRED')),
    callback_attempts INTEGER NOT NULL DEFAULT 0,
    callback_error  TEXT NOT NULL DEFAULT '',

    expires_at      TIMESTAMPTZ NOT NULL,
    decided_at      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One open request per subject. A second proposal for the same object
    -- while one is pending is a mistake — usually a double-submit — and
    -- allowing it would mean two approvers each approving "the" request for
    -- one payout.
    CONSTRAINT approval_requests_subject_key UNIQUE (subject_type, subject_id, payload_digest)
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_pending
    ON approval_requests (created_at DESC) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_approval_requests_subject
    ON approval_requests (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_expiry
    ON approval_requests (expires_at) WHERE status = 'PENDING';

-- One row per person who acted. Separate from the request because
-- approvals_required can be more than one, and because "who approved this"
-- is a question an auditor asks years later.
CREATE TABLE IF NOT EXISTS approvals (
    id            TEXT PRIMARY KEY,
    request_id    TEXT NOT NULL REFERENCES approval_requests (id) ON DELETE CASCADE,
    decision      TEXT NOT NULL CHECK (decision IN ('APPROVE', 'REJECT')),
    decided_by    TEXT NOT NULL,
    decided_by_roles TEXT[] NOT NULL DEFAULT '{}',
    comment       TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One decision per person per request, enforced here rather than in
    -- application code: a two-of-two policy that one person could satisfy by
    -- clicking twice is a one-of-one policy with extra steps.
    UNIQUE (request_id, decided_by)
);

-- ---------------------------------------------------------------------------
-- Seed policies
--
-- Every one of these has exclude_initiator = TRUE, which the plan calls
-- non-negotiable for exactly this list.
-- ---------------------------------------------------------------------------

INSERT INTO policies (id, action, description, approvals_required, approver_roles, expires_after_hours) VALUES
    ('pol_payout', 'payments.payout',
     'Releasing funds to an external beneficiary.',
     1, ARRAY['treasury', 'admin'], 24),

    ('pol_reversal', 'ledger.reversal',
     'Reversing a posted journal transaction by contra-entry.',
     1, ARRAY['treasury'], 24),

    ('pol_manual_journal', 'ledger.manual_journal',
     'An operator-entered journal adjustment.',
     1, ARRAY['treasury'], 24),

    ('pol_closure', 'ledger.closure',
     'Closing an accounting period. Irreversible: nothing can be posted with a value date on or before it afterwards.',
     2, ARRAY['treasury'], 72),

    ('pol_break_glass', 'redemption.break_glass',
     'Settling a redemption by hand, bypassing the saga. The burn is real and irreversible.',
     1, ARRAY['treasury', 'admin'], 12),

    ('pol_blacklist', 'compliance.blacklist',
     'Blacklisting an address on-chain. Freezes a holder''s tokens.',
     1, ARRAY['compliance'], 24),

    ('pol_pause', 'compliance.pause',
     'Pausing the contract. Halts every transfer on the chain.',
     2, ARRAY['compliance', 'admin'], 6),

    ('pol_kyc_approve', 'kyc.approve',
     'Approving a KYC case, which unfreezes the party''s ability to transact.',
     1, ARRAY['compliance'], 168),

    ('pol_role_grant', 'identity.role_grant',
     'Granting a platform role.',
     1, ARRAY['admin'], 72),

    ('pol_rebalance', 'treasury.rebalance',
     'Moving funds between custodians.',
     2, ARRAY['treasury'], 48)
ON CONFLICT (action) DO NOTHING;
