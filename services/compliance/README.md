# services/compliance

Screening, risk rules, alerts, cases, SAR export, and the on-chain
enforcement `COMPLIANCE_ROLE` and `PAUSER_ROLE` have been waiting for.

## It sees everything, because of the outbox

This service consumes `damp.ledger.transaction_posted.v1`, which core-ledger
writes **inside the same `SERIALIZABLE` transaction** that writes the journal
lines. There is no window in which money moved and compliance was not told.

That property is why the outbox was built in P2, a phase before anything
consumed it. The consequence here is that the service must be idempotent:
at-least-once delivery means the same posting arrives more than once as a
matter of routine, and `UNIQUE (rule_id, transaction_id)` on alerts is where
that is enforced.

Only entries against a customer wallet (`2100.<CCY>.<walletID>`) become
movements. A deposit also touches the custodian's cash account, and screening
the platform's own reserve account against a sanctions list on every deposit
would be useless and, with a real vendor, billed.

## The rules engine is pure functions

`src/rules/engine.ts` takes a movement and a window of that party's history
and returns findings. No database, no clock, no network — the caller supplies
all three.

That is not tidiness. A compliance rule decides whether somebody's money is
allowed to move, and the only way to know a rule does what its name says is to
hand it a fabricated history and assert on the answer. A rule that needs a
populated Postgres and a mocked `Date.now()` gets tested once, at the wrong
values. `test/engine.spec.ts` is 21 cases at the boundaries that matter:

- `AMOUNT_THRESHOLD` fires **at** the threshold, not only above it — treating
  $10,000 as "over ten thousand" makes exactly-at-the-limit the safe amount to
  send.
- `VELOCITY` counts the movement being evaluated, not just history, or the
  rule fires one transaction late every time.
- `AGGREGATE_WINDOW` sums scaled integers — a total accumulated as floats
  fires at $49,999.99999 instead of $50,000.
- `STRUCTURING` catches the pattern thresholds themselves create: five
  transfers of $9,900 trip no amount rule, and that is the entire technique.
- `NEW_PARTY_LARGE_TX` treats a null `firstSeenAt` as *new* — otherwise it
  exempts the very first transaction, which is the one it exists for.

The vocabulary of rule kinds is fixed and small. A compliance service with an
expression language is one where a rule can throw at evaluation time — on the
path that decides whether a transaction is allowed — and where "what do our
rules actually say" has no answer short of reading code.

**Every seeded rule ships as FLAG or REVIEW. None ships as BLOCK.** A rule
that can freeze a customer's money on the day it is deployed has never been
observed against real traffic, and the false-positive rate of an unobserved
rule is unknown by definition.

## Alerts, cases and SARs

An alert is *"a rule fired"*; a case is *"somebody is looking into it"*. One
case covers many alerts — the same party tripping a velocity rule eleven times
is one investigation, and opening eleven cases would make the queue a measure
of how noisy the rules are rather than of how much work there is. A case's
severity only ever rises.

Case notes are append-only: a note is contemporaneous evidence of what an
investigator knew and when, and an editable one is worth nothing in review.

Closing as `CLOSED_SAR` **requires a narrative**, because the narrative *is*
the report. The SAR export returns it verbatim rather than regenerating it —
a filed report is a legal document, and regenerating from current data would
produce a different document every time it was exported.

## Enforcement stops short, visibly

Blacklisting freezes a holder's tokens; pausing halts every transfer on the
chain for everybody. Both go through maker-checker before anything is
submitted, and the seeded `compliance.pause` policy needs **two** approvals.

Wallet freezes execute immediately — they need no key, going through
core-ledger's existing wallet status.

Blacklist and pause **do not**. Submitting them means holding a key with
`COMPLIANCE_ROLE` or `PAUSER_ROLE`, and key custody is P6. Until then an
approved action sits `APPROVED` with an explicit reason rather than being
marked `EXECUTED` on the strength of nothing having happened — visibly
incomplete rather than quietly wrong.
