# services/reporting

Report definitions, runs, CSV exports, and Superset guest tokens.

## It owns no numbers

Every figure in every report is read from the service that owns it at the
moment the run executes, and **frozen into the run's row**.

That freezing is the reason a run is a row at all. A trial balance regenerated
on demand gives a different answer every time somebody opens it, which is
useless as a record — *"the trial balance we filed on the 3rd"* has to still
say what it said on the 3rd. The export serves the stored result, never a
fresh query, and carries the result's SHA-256 in a header so a downloaded file
can be proved to match the run id printed on it.

There is also **no query interface**. Report kinds are a fixed vocabulary and
each one is a named HTTP call to the owning service. A reporting service that
runs arbitrary SQL against other services' databases is a reporting service
that has bypassed every boundary this platform has.

## The Superset fix

`frontend/src/services/supersetService.ts` called Superset's
`POST /api/v1/security/guest_token/` **directly from the browser**. That
endpoint requires a Superset **admin** bearer token — so either an admin
credential was being shipped to the browser, or the call had never worked.

The second is how it survived: nothing in the app rendered a dashboard, so
nothing surfaced the failure.

Guest tokens are now minted here, where the admin credential lives. The
browser never touches Superset's API — only the embed SDK, with a token it was
given, loaded from a domain the server named.

### Row-level security is the access control

A guest token carries RLS clauses Superset applies to every query the iframe
runs. `rlsFor` has three outcomes, and the third is the one that matters:

| Caller holds | Clause |
|---|---|
| a `:any` read permission | none — they may see everything, which is what it means |
| only `:own` | `party_id = '<resolved party id>'` |
| neither | **refused** |

A missing RLS clause is *not* a safe default. It is the absence of the
control, and Superset would happily serve every customer's rows to the token.
So a caller with no read permission gets no token rather than an unrestricted
one.

The permissions come from the `X-Permissions` header auth-proxy set and
Traefik stripped from the inbound request — never from a body field, which
would be the caller telling us what they are allowed to see.

## CSV escaping, including the rule people leave out

Four rules, written out rather than pulled in — a library for four rules is a
library whose version and transitive dependencies have to be tracked forever.

1. Quote a field containing a comma, quote or newline.
2. Double an embedded quote.
3. CRLF line endings, per RFC 4180 — Excel is the consumer that cares.
4. **Prefix a field starting with `=`, `+`, `-` or `@`.**

The fourth is a genuine vulnerability, not a nicety: a customer whose account
name is `=HYPERLINK("http://evil","click")` gets that executed in whoever
opens the export. It is not theoretical here — account names and invoice
descriptions are customer-supplied and both appear in reports. Prefixing
rather than stripping keeps a name that legitimately starts with a hyphen
legible.

## The reports

| | Reads from | Notes |
|---|---|---|
| Trial balance | core-ledger | Surfaces `balanced` in the summary — a trial balance whose debits and credits disagree is the one fact a reader needs first. |
| Wallet statement | core-ledger | Entries with running balances over a range. |
| Reconciliation pack | core-ledger | Runs *and* open breaks: a regulator asks "were you balanced, and when were you not", and both halves are needed. |
| Reserve attestation | core-ledger | Includes open breaks — an attestation that omitted them would assert the reserves are fine while a control says otherwise. |
| Transaction register | core-ledger | Every journal transaction in a period. |
| Audit extract | audit-trail | Carries each event's hash and anchor id, so a row pasted into a report can still be traced and proved. |
