# services/audit-trail

Who did what, in a form that survives somebody with database access deciding
they would rather it said something else.

It is **not a log aggregator** — Loki already has the logs. This holds the
comparatively small set of events that are *evidence*: a role granted, a case
closed, a payout approved, a period closed.

## Two mechanisms, two questions

| | Answers | Cannot answer |
|---|---|---|
| **Hash chain** | *Has anything been removed or altered?* — to anyone who can read the table, with no trust in the process that wrote it. | *When* a row was written. Somebody who controls the database can rewrite the chain from any point and produce a log that verifies perfectly. |
| **Merkle anchor** | *And when* — once a root covering a window is published somewhere this platform does not control, no rewrite of those hours can produce that root. | Anything about events after the last anchor. |

That is why both exist. Either alone leaves a gap the other closes.

## The Merkle implementation, and two details that matter

`internal/chain` is pure functions over byte slices — no database, no clock.
The value of an audit trail is that somebody can verify it *independently*,
and a verifier that needs this platform's database running is not independent.

**RFC 6962 domain separation.** Leaves are hashed with a `0x00` prefix,
internal nodes with `0x01`. Without it, an internal node's preimage — 64 bytes
of two hashes — could be submitted as a *leaf*, producing the same root from a
different tree.

**An odd node is promoted, never duplicated.** Duplicating it is the common
shortcut (and Bitcoin's), and it makes a tree of *n* leaves collide with one
where the last leaf genuinely appears twice — CVE-2012-2459. For an audit
trail that means two different histories under one anchor, which is the exact
property an anchor exists to rule out. There is a test for it.

An inclusion proof is ~log₂(n) hashes, which is what makes publishing a
32-byte root as good as publishing everything — and it lets one party prove
their own event without seeing the rest of the log, which is other customers'
activity.

## Endpoints

| | |
|---|---|
| `POST /internal/events` | Where services record. Cluster-internal, absent from the gateway, and gated on `Authorization: Bearer $INGEST_TOKEN` when that is set. **Idempotent on `id`**: 201 the first time, 200 with the original seq/hash on a redelivery, 409 for a *different* event under a recorded id. |
| `GET /audit/events` | Filter by actor, action, subject or request id. |
| `GET /audit/events/:id/proof` | The event, its inclusion proof, the root, **and the algorithm** — an inclusion proof somebody cannot independently check is a claim, not a proof. |
| `GET /audit/anchors` | Every root, with its publication status. |
| `GET /audit/verify` | A full walk of the chain. Not a spot check: a tamper that breaks one link is exactly what a spot check misses. |

The chain is verified **at boot**, and a break is a refusal to start — a break
discovered later cannot be dated, because every row after it is equally
suspect.

## Producers

Nothing calls the recording endpoint inline. Each producer writes the event
to its **own** `audit_outbox` table in the same transaction as the action,
and a relay delivers it here — so an outage of this service neither blocks a
decision nor loses its evidence, and an action that rolled back leaves no
evidence behind. Delivery is at-least-once; the event id minted at enqueue is
what this service dedupes on.

| Producer | Library | What it records |
|---|---|---|
| core-ledger | `shared/go/platform/audit` (relay in the worker) | every journal posting, reversals, manual journals, wallet creation and status changes, period closes, dead-letter resolutions, chain-supply and custodian snapshots (with the value an overwrite replaced) |
| signer | `shared/go/platform/audit` | every signature and refusal, from the same transaction as its own hash-chained row, carrying that row's hash |
| identity | `@damp/nest-platform` audit | party, org and owner-membership creation (JIT provisioning) |
| payments | `@damp/nest-platform` audit | intents created/cancelled/settled/failed, wrong-amount callbacks (`DENIED`), bank accounts registered/verified/removed, beneficiaries, invoices issued/voided |
| rms | `@damp/nest-platform` audit | reserve targets, custodian drift, attestations created/refused (`DENIED`)/published |
| reporting | `@damp/nest-platform` audit | report runs (with result hash), CSV exports, Superset guest tokens issued/refused |
| workflow | `@damp/nest-platform` audit | proposals, each approval, rejections, cancellations, expiries, refused self-approvals (`DENIED`) |
| compliance | `@damp/nest-platform` audit | enforcement proposals/approvals/execution, refused approvals, case assignment and closure, alert dismissal |
| kyc | `@damp/nest-platform` audit | reviewer decisions, approvals (with the tier change), rejections, refused approvals |

The relays retry transient failures **without an attempt budget** — giving
up because this service was down would put a hole in the trail exactly where
an outage was — and dead-letter only an outright 4xx refusal.
`audit_outbox_pending_events` is the alarm.

## What publishing actually does today

The default publisher writes roots to this service's own structured log, and
that is **deliberately weak**: a root in a log this platform controls proves
nothing an attacker with that control could not also rewrite. Its value is
operational — the roots land in Loki, a different system with a different
retention and a different set of people who can delete from it, which raises
the bar from "edit one table" to "edit one table and one log store".

The real answer is on-chain, through `services/signer`: 32 bytes to a
contract, on the same path as a mint. Not built here, because doing it
properly means a contract to hold the roots, gas budgeting and a signer policy
rule — and a half-built version that silently no-opped would be worse than an
honest `SKIPPED`.

With no publisher at all, roots are **still computed and stored**. An
unpublished anchor is a weaker guarantee, not a lost one.

## Append-only means the database says so

`events` carries the same trigger shape `journal_entries` and `signatures` do
— and for the strongest version of the same reason. This table exists to be
unalterable, so "the application never updates it" is not a guarantee, it is
an intention.

The one field that legitimately changes after insert is `anchor_id`: an event
is recorded before its window is anchored, and the trigger permits exactly
that transition and nothing else.
