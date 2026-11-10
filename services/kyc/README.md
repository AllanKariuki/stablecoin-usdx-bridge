# services/kyc

KYC cases, documents, tiers and limits.

## The lifecycle, and the two shortcuts not taken

```
DRAFT → SUBMITTED → SCREENING → PENDING_REVIEW → PENDING_APPROVAL → APPROVED
                                     ↘ REJECTED (auto, or by a reviewer)
```

**A CLEAR screen does not auto-approve.** It skips the human queue — straight
to `PENDING_APPROVAL` — but still passes through maker-checker. "Clear" is a
provider's opinion, approving a case grants a tier that can move money, and a
provider misconfiguration would otherwise silently onboard everyone.

**`PENDING_APPROVAL` is not `APPROVED`.** The reviewer's decision *opens* a
workflow request; the tier is granted only when that request comes back
approved **and its payload digest still matches the case**. A reviewer
deciding and a system acting are deliberately two events.

A sanctions match (`@reject.test`) is auto-declined rather than queued.
Routing it to a human would mean somebody clicking "reject" on something
nobody may lawfully onboard.

## TIER_0 can do nothing

That is what makes the plan's DoD — *"a stranger signs up, submits KYC, is
auto-screened, reviewed and approved, and **only then** can deposit"* — true
by construction rather than by every caller remembering to check. A party with
no row in `party_tiers` is TIER_0, and TIER_0 has `can_deposit = FALSE`.

Gating uses the two mechanisms that already exist — core-ledger's
`POST /wallets/:id/status` (whose `ACCOUNT_FROZEN` 409 every service already
handles) and the tier's limits. Inventing a third would mean three places that
can stop a transaction and three answers to why one was stopped.

Unfreezing never thaws a wallet a *compliance* hold put on: an approved KYC
case must not quietly undo a sanctions freeze applied for an entirely
different reason.

## The stub is deterministic, by email domain

| domain | outcome |
|---|---|
| `@reject.test` | REJECT — the auto-decline path |
| `@review.test` | REVIEW — the queue a human works |
| `@pep.test` | REVIEW, higher score |
| anything else | CLEAR |

The plan asks for this by name. A random stub makes a demo that cannot be
rehearsed — three clean runs and a rejection on the fourth, in front of
whoever you were showing — and makes the rejection path untestable, because no
test can arrange for one. Risk scores are hashed from the party id rather than
randomised, so the same party screens identically across a database reset.

## Documents never pass through this service

The browser PUTs straight to object storage on a short-lived presigned URL.
That keeps passport scans out of this process's memory, its logs, its request
traces and every intermediary that would otherwise see the body — and means a
compromise of this service leaks *references*, not files.

Only the object key is stored, never a URL: a stored URL embeds the bucket's
hostname and access model, and both change. The SHA-256 of each file is kept
for two reasons — detecting the same document submitted under two identities,
and proving years later that the file in storage is the file that was
reviewed.
