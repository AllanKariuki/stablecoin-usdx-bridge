-- +goose Up

-- services/audit-trail answers one question: who did what, and can anybody
-- prove the answer hasn't changed?
--
-- It is not a log aggregator. Loki already has the logs. This holds the
-- comparatively small set of events that are *evidence* — a role granted, a
-- case closed, a payout approved, a period closed — in a form that survives
-- somebody with database access deciding they would rather it said something
-- else.

CREATE TABLE IF NOT EXISTS events (
    seq          BIGSERIAL PRIMARY KEY,
    id           TEXT NOT NULL UNIQUE,

    -- Who. Three fields rather than one because "acted on behalf of" is a
    -- real distinction: an admin performing an action for a customer is not
    -- the same event as the customer performing it.
    actor        TEXT NOT NULL,
    actor_roles  TEXT[] NOT NULL DEFAULT '{}',
    on_behalf_of TEXT NOT NULL DEFAULT '',

    -- What. `action` is a dotted verb the emitting service chooses
    -- ("kyc.case.approved"); subject_type/subject_id name the object.
    action       TEXT NOT NULL,
    subject_type TEXT NOT NULL DEFAULT '',
    subject_id   TEXT NOT NULL DEFAULT '',
    service      TEXT NOT NULL,

    outcome      TEXT NOT NULL DEFAULT 'SUCCESS'
                 CHECK (outcome IN ('SUCCESS', 'FAILURE', 'DENIED')),

    -- Before/after, when the action changed something. Kept separate from a
    -- generic payload because "what did it look like before" is the question
    -- a dispute actually asks, and reconstructing it from a diff of two
    -- opaque blobs is work nobody does under pressure.
    before_state JSONB,
    after_state  JSONB,
    metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Where from. request_id ties an audit event to the request that caused
    -- it across every service's logs.
    request_id   TEXT NOT NULL DEFAULT '',
    source_ip    TEXT NOT NULL DEFAULT '',
    user_agent   TEXT NOT NULL DEFAULT '',

    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- The hash chain. Same construction as services/signer's, for the same
    -- reason: removing or altering a row breaks every hash after it,
    -- detectably, without trusting the process that wrote them.
    prev_hash    TEXT NOT NULL,
    hash         TEXT NOT NULL,

    -- Set once this event's hour has been anchored. NULL means "recorded but
    -- not yet provable against an external root", which is a real and
    -- temporary state rather than a defect.
    anchor_id    TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_actor    ON events (actor, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_subject  ON events (subject_type, subject_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_action   ON events (action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_request  ON events (request_id) WHERE request_id <> '';
CREATE INDEX IF NOT EXISTS idx_events_unanchored ON events (seq) WHERE anchor_id IS NULL;

-- ---------------------------------------------------------------------------
-- Anchors
--
-- A Merkle root over one window of events, published somewhere this platform
-- does not control.
--
-- The hash chain proves nothing was *removed*. It cannot prove *when* a row
-- was written: somebody who controls the database can rewrite the chain from
-- any point and produce a consistent-looking log. A root on a public chain
-- can't be rewritten, so anything it covers is fixed as of that block.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS anchors (
    id            TEXT PRIMARY KEY,

    -- The window, by sequence number rather than by time: an anchor must
    -- cover a contiguous run of events with no ambiguity about which side of
    -- a boundary a row falls on.
    from_seq      BIGINT NOT NULL,
    to_seq        BIGINT NOT NULL,
    event_count   INTEGER NOT NULL,

    merkle_root   TEXT NOT NULL,
    -- The last event's chain hash, so an anchor pins both structures at once.
    chain_tip     TEXT NOT NULL,

    status        TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED', 'SKIPPED')),

    -- Where it was published. Empty while PENDING; SKIPPED when no publisher
    -- is configured, which is an honest state rather than a silent one — the
    -- root is still computed and stored, so it can be published later.
    chain         TEXT NOT NULL DEFAULT '',
    tx_hash       TEXT NOT NULL DEFAULT '',
    published_at  TIMESTAMPTZ,
    last_error    TEXT NOT NULL DEFAULT '',

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One anchor per window. Re-running the anchoring job for an hour that
    -- already has one must not produce a second root over the same events.
    UNIQUE (from_seq, to_seq)
);

CREATE INDEX IF NOT EXISTS idx_anchors_pending ON anchors (created_at) WHERE status = 'PENDING';

-- +goose StatementBegin
-- Append-only, enforced by the database. The same trigger shape core-ledger
-- uses on journal_entries and services/signer uses on signatures — and for
-- the strongest version of the same reason: this table exists to be
-- unalterable, so "the application never updates it" is not a guarantee, it
-- is an intention.
CREATE OR REPLACE FUNCTION events_are_append_only() RETURNS trigger AS $$
BEGIN
    -- anchor_id is the one field that legitimately changes after insert: an
    -- event is recorded before its window is anchored. Everything else is
    -- frozen.
    IF TG_OP = 'UPDATE'
       AND NEW.seq = OLD.seq AND NEW.id = OLD.id AND NEW.hash = OLD.hash
       AND NEW.prev_hash = OLD.prev_hash AND NEW.actor = OLD.actor
       AND NEW.action = OLD.action AND NEW.outcome = OLD.outcome
       AND OLD.anchor_id IS NULL THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'events is append-only (attempted % on seq %); an audit event is never edited or removed',
        TG_OP, COALESCE(OLD.seq, NEW.seq);
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_events_append_only ON events;
CREATE TRIGGER trg_events_append_only
    BEFORE UPDATE OR DELETE ON events
    FOR EACH ROW EXECUTE FUNCTION events_are_append_only();

-- +goose Down
DROP TRIGGER IF EXISTS trg_events_append_only ON events;
DROP FUNCTION IF EXISTS events_are_append_only();
DROP TABLE IF EXISTS anchors;
DROP TABLE IF EXISTS events;
