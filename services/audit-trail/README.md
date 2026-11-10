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
| `POST /internal/events` | Where services record. Cluster-internal, absent from the gateway. |
| `GET /audit/events` | Filter by actor, action, subject or request id. |
| `GET /audit/events/:id/proof` | The event, its inclusion proof, the root, **and the algorithm** — an inclusion proof somebody cannot independently check is a claim, not a proof. |
| `GET /audit/anchors` | Every root, with its publication status. |
| `GET /audit/verify` | A full walk of the chain. Not a spot check: a tamper that breaks one link is exactly what a spot check misses. |

The chain is verified **at boot**, and a break is a refusal to start — a break
discovered later cannot be dated, because every row after it is equally
suspect.

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
