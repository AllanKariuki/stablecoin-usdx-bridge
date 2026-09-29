# services/workflow

Maker-checker, once.

The plan puts this first in P5 for a stated reason: approval is needed in five
places — payouts, treasury rebalances, blacklisting, contract pause, role
grants, reversals — and *"implementing it five times gives five definitions of
approved"*. Five answers to whether the proposer can approve their own
request, whether a second approval on a changed payload still counts, and what
happens when a policy is edited while a request is open.

## The contract, and why it is this narrow

**This service does not execute anything.** It stores a SHA-256 digest of what
was proposed and hands it back on approval; the calling service re-computes
that digest over its own stored object and refuses to act if it differs.

The consequence is the point:

> A compromised workflow service cannot authorize anything. It can return
> "approved" for whatever it likes — the caller will not find a matching
> object and will do nothing.

Approval is a statement about *a specific payload*, not about a request id.
If a payout's destination were swapped between proposal and execution, the
digests would differ and the payout would not happen.

That only holds if the encoding is canonical, which is why
`src/requests/digest.ts` sorts keys recursively, drops `undefined`, keeps
array order (a list of payout lines is not the same payout reordered) and
emits no whitespace. `test/digest.spec.ts` asserts both halves: stability
(key order, absent vs undefined, repeated calls) and sensitivity (amount
changed, destination swapped, field added, `"250"` vs `250`).

Callers reimplement the encoding rather than asking this service for the
digest they are verifying against — asking would hand a compromised workflow
the ability to choose it. `services/kyc/test/digest-agreement.spec.ts` imports
both implementations and asserts they agree, so a drift is a red build rather
than the day nothing can be approved any more.

## What is enforced, and where

| | |
|---|---|
| `exclude_initiator` | Defaults **TRUE**, and is TRUE on every seeded policy. The plan calls it non-negotiable for payouts, rebalances, blacklist, pause, role grants and reversals. It is the single most common way maker-checker is defeated in practice: the maker approves their own work because the UI let them. |
| One decision per person | `UNIQUE (request_id, decided_by)`, in the database. A two-of-two policy that one person could satisfy by clicking twice is a one-of-one policy with extra steps. |
| Approver roles | Checked against the roles auth-proxy resolved, not roles the caller asserts. |
| Expiry | An approval granted against three-week-old context is not really an approval. |
| Re-proposal | `ON CONFLICT (subject_type, subject_id, payload_digest)` — a double-submit returns the open request rather than creating a second one two approvers could each approve. |

An action with **no policy is refused**, not waved through. Defaulting to "no
approval needed" would make forgetting to write a policy the same as deciding
none was required.

`approvals:policies:manage` is held by **no role**, deliberately — including
`admin`. Editing a policy changes how many people must agree to a payout, or
whether the proposer can approve their own, so a role that held it could
weaken maker-checker and then use it.

## Delivery

Decisions are delivered by a retrying drain loop, not fired once at decision
time. The approver should not wait on a downstream service being up, and the
downstream service should not miss a decision because it happened to be
restarting. An approval nobody hears about is the same as no approval — so a
delivery that exhausts its budget logs at **error**, because an approved
payout whose callback never landed is money somebody authorized and nobody
moved.
