-- identity's schema: parties (a Keycloak subject mapped to the opaque
-- party id that core-ledger's wallets.user_id and every other service
-- treats as the real user identity — see docs/building-plan.md's P1
-- "Identity is three layers" decision), orgs (mirrors a Keycloak
-- /orgs/<slug> group), and memberships (the many-to-many between them — a
-- party can belong to more than one org over time even though today's JIT
-- provisioning only ever creates one membership, on first login).
CREATE TABLE IF NOT EXISTS parties (
    id               TEXT PRIMARY KEY,
    keycloak_subject TEXT NOT NULL UNIQUE,
    type             TEXT NOT NULL CHECK (type IN ('PERSON', 'ORGANIZATION', 'SUB_ACCOUNT')),
    email            TEXT,
    display_name     TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orgs (
    id         TEXT PRIMARY KEY,
    org_id     TEXT NOT NULL UNIQUE, -- the Keycloak group's org_id attribute (infra/keycloak/realms/damp-realm.json)
    slug       TEXT NOT NULL,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
    id         TEXT PRIMARY KEY,
    party_id   TEXT NOT NULL REFERENCES parties (id) ON DELETE CASCADE,
    org_id     TEXT NOT NULL REFERENCES orgs (id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (party_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_party ON memberships (party_id);
