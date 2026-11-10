-- services/payments owns workflow state for money entering and leaving the
-- platform. It owns no balance: every intent that settles does so by calling
-- core-ledger's POST /deposits, /withdrawals or /transfers, and the resulting
-- journal transaction is the record of value.
--
-- The link back is free. core-ledger's Deposit and Withdraw already stamp
-- entity_type = 'BANK_PAYMENT' with entity_id = the caller's reference, so
-- passing a payment intent's id as that reference makes
-- Repository.TransactionsForEntity walk straight from the intent to its
-- journal legs — without a foreign key between two services' databases, which
-- is the thing that would actually be wrong here.

-- ---------------------------------------------------------------------------
-- Bank accounts and beneficiaries
--
-- These serve the endpoints the frontend has already been written against:
-- /banks/available, /banks/user-accounts, /banks/linked-accounts,
-- /banks/register, /banks/link (see frontend/src/redux/slices/
-- bankAccountsSlice.ts, which currently falls back to mock data on every
-- one of them).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS banks (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    country       TEXT NOT NULL DEFAULT 'KE',
    currency      TEXT NOT NULL DEFAULT 'KES',
    swift_code    TEXT NOT NULL DEFAULT '',
    -- rail names the RailProvider that moves money to and from this
    -- institution: 'stub' or 'mpesa' today. A new rail is a row, not a deploy.
    rail          TEXT NOT NULL DEFAULT 'stub',
    logo_url      TEXT NOT NULL DEFAULT '',
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_accounts (
    id             TEXT PRIMARY KEY,
    party_id       TEXT NOT NULL,
    bank_id        TEXT NOT NULL REFERENCES banks (id),

    -- Only the last four digits are stored in the clear. The full number is
    -- not needed after the rail has verified the account: it is a credential
    -- for a customer's bank relationship, and a payments service that keeps
    -- one is a payments service that can leak one.
    account_name   TEXT NOT NULL,
    account_last4  TEXT NOT NULL,
    account_ref    TEXT NOT NULL,      -- the rail's own opaque handle
    currency       TEXT NOT NULL,

    status         TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED', 'REMOVED')),
    verified_at    TIMESTAMPTZ,
    is_default     BOOLEAN NOT NULL DEFAULT FALSE,

    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (party_id, bank_id, account_ref)
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_party ON bank_accounts (party_id) WHERE status <> 'REMOVED';

-- A beneficiary is somebody else's account a party pays *to*. Separate from
-- bank_accounts because the trust model is different: your own account is
-- verified by proving you control it, a beneficiary's is verified by name
-- matching, and conflating them is how a payout goes to an account the sender
-- never confirmed.
CREATE TABLE IF NOT EXISTS beneficiaries (
    id            TEXT PRIMARY KEY,
    party_id      TEXT NOT NULL,
    name          TEXT NOT NULL,
    bank_id       TEXT REFERENCES banks (id),
    account_ref   TEXT NOT NULL,
    currency      TEXT NOT NULL,
    -- WALLET beneficiaries are another DAMP party; BANK ones leave the
    -- platform entirely. The distinction decides whether a payout is a
    -- transfer or a withdrawal.
    kind          TEXT NOT NULL DEFAULT 'BANK' CHECK (kind IN ('BANK', 'WALLET', 'MOBILE')),
    target_party_id TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (party_id, kind, account_ref)
);

-- ---------------------------------------------------------------------------
-- Payment intents
--
-- The central object. An intent is a *request* to move money that has not
-- happened yet; the journal transaction it creates when it settles is what
-- actually happened. Keeping them separate is what lets an intent be
-- REQUIRES_ACTION or FAILED without any of that showing up as a balance.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payment_intents (
    id              TEXT PRIMARY KEY,
    party_id        TEXT NOT NULL,

    -- DEPOSIT: fiat in from a bank rail. WITHDRAWAL: fiat out.
    -- TRANSFER: party to party inside the platform.
    direction       TEXT NOT NULL CHECK (direction IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER')),

    amount          TEXT NOT NULL,      -- decimal string at the currency's scale
    currency        TEXT NOT NULL,

    wallet_id       TEXT NOT NULL DEFAULT '',
    bank_account_id TEXT REFERENCES bank_accounts (id),
    beneficiary_id  TEXT REFERENCES beneficiaries (id),
    invoice_id      TEXT,

    rail            TEXT NOT NULL DEFAULT 'stub',
    rail_ref        TEXT NOT NULL DEFAULT '',   -- the rail's own transaction id

    status          TEXT NOT NULL DEFAULT 'REQUIRES_ACTION' CHECK (status IN (
                        'REQUIRES_ACTION',  -- waiting on the customer (an M-Pesa STK prompt)
                        'PROCESSING',       -- the rail has it
                        'SETTLED',          -- the rail confirmed AND the ledger posted
                        'FAILED',
                        'CANCELLED')),

    -- The journal transaction this intent produced. Empty until settlement,
    -- and the presence of a value is what makes settlement idempotent: a
    -- duplicate rail callback finds it already set and does nothing.
    ledger_tx_id    TEXT NOT NULL DEFAULT '',

    -- Client-supplied and UNIQUE, on the same terms as core-ledger's own
    -- writes: the guarantee only holds if the client reuses the key.
    idempotency_key TEXT NOT NULL UNIQUE,

    description     TEXT NOT NULL DEFAULT '',
    failure_reason  TEXT NOT NULL DEFAULT '',
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_party  ON payment_intents (party_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents (status) WHERE status IN ('REQUIRES_ACTION', 'PROCESSING');
-- A rail reference is how an inbound callback finds its intent. It is not
-- unique: a rail that retries a callback reuses it, which is the point.
CREATE INDEX IF NOT EXISTS idx_payment_intents_rail_ref ON payment_intents (rail, rail_ref) WHERE rail_ref <> '';

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoices (
    id            TEXT PRIMARY KEY,
    number        TEXT NOT NULL UNIQUE,
    issuer_party_id TEXT NOT NULL,

    -- A payer may be a DAMP party or an email address that isn't one yet. The
    -- second case is what makes a payment *link* useful: an invoice somebody
    -- can pay before they have an account.
    payer_party_id TEXT NOT NULL DEFAULT '',
    payer_email    TEXT NOT NULL DEFAULT '',
    payer_name     TEXT NOT NULL DEFAULT '',

    amount        TEXT NOT NULL,
    currency      TEXT NOT NULL,

    status        TEXT NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT', 'OPEN', 'PAID', 'VOID', 'OVERDUE')),
    due_date      DATE,
    description   TEXT NOT NULL DEFAULT '',
    line_items    JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- The token in a payment link. Unguessable and revocable by voiding the
    -- invoice; it is a bearer credential for paying *this* invoice and
    -- nothing else.
    pay_token     TEXT UNIQUE,

    paid_intent_id TEXT REFERENCES payment_intents (id),
    paid_at       TIMESTAMPTZ,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_issuer ON invoices (issuer_party_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_payer  ON invoices (payer_party_id) WHERE payer_party_id <> '';

-- ---------------------------------------------------------------------------
-- Bank statement import
--
-- A line from a custodian's statement, matched (or not) to an intent. The
-- unmatched ones are the interesting rows: money arrived that nothing in the
-- platform was expecting.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS statement_lines (
    id            TEXT PRIMARY KEY,
    bank_id       TEXT NOT NULL REFERENCES banks (id),
    statement_ref TEXT NOT NULL,
    value_date    DATE NOT NULL,
    amount        TEXT NOT NULL,
    currency      TEXT NOT NULL,
    direction     TEXT NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
    narrative     TEXT NOT NULL DEFAULT '',
    counterparty  TEXT NOT NULL DEFAULT '',

    matched_intent_id TEXT REFERENCES payment_intents (id),
    matched_at    TIMESTAMPTZ,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One line per (bank, statement reference): re-importing a statement is
    -- routine and must not double-count.
    UNIQUE (bank_id, statement_ref)
);

CREATE INDEX IF NOT EXISTS idx_statement_lines_unmatched
    ON statement_lines (value_date DESC) WHERE matched_intent_id IS NULL;

-- ---------------------------------------------------------------------------
-- Seed institutions
--
-- Two stub banks and M-Pesa. KES is already a seeded currency in core-ledger,
-- and Daraja's sandbox is free and self-service — which is the plan's whole
-- test for whether a real integration belongs in a phase at all.
-- ---------------------------------------------------------------------------

INSERT INTO banks (id, name, country, currency, swift_code, rail) VALUES
    ('bank_equity',  'Equity Bank',            'KE', 'KES', 'EQBLKENA', 'stub'),
    ('bank_kcb',     'KCB Bank',               'KE', 'KES', 'KCBLKENX', 'stub'),
    ('bank_chase',   'DAMP Test Bank (USD)',   'US', 'USD', 'DAMPUS33', 'stub'),
    ('bank_mpesa',   'M-Pesa',                 'KE', 'KES', '',         'mpesa')
ON CONFLICT (id) DO NOTHING;
