# services/payments

Payment intents, invoices, payment links, beneficiaries and bank rails.

**It owns no balance.** Every intent that settles does so by calling
core-ledger's `POST /deposits`, `/withdrawals` or `/transfers`, and the
journal transaction that produces is the record of value. What lives here is
the workflow around it: what somebody asked to happen, what a rail said about
it, and what is still in flight.

The link back to the journal is free. core-ledger's `Deposit` and `Withdraw`
already stamp `entity_type = 'BANK_PAYMENT'` with `entity_id` = the caller's
reference, so passing an intent id as that reference makes
`Repository.TransactionsForEntity` walk from an intent straight to its journal
legs — with no foreign key between two services' databases, which is the thing
that would actually be wrong here.

## Running it

```bash
cp .env.example .env
pnpm --filter @damp/payments start:dev
```

## The shape that matters: settlement

```
rail confirms  →  ledger posts  →  intent marked SETTLED
```

That order is load-bearing:

- **Marking the intent first** would let a crash between the two leave a
  payment that says SETTLED with no journal entry behind it — a balance that
  exists in a dashboard and nowhere else.
- **Posting first and marking after** means a crash leaves a journal entry and
  an intent still saying PROCESSING, which the next callback resolves
  correctly, because the ledger write is idempotent on `payments:<intent id>`.

Nothing here is a distributed transaction and nothing needs to be: there is
exactly one write that moves value, and it is idempotent.

Two failure distinctions the code makes deliberately:

| The ledger says | What it means | What happens |
|---|---|---|
| 4xx | This movement is not allowed and never will be — overdrawn, frozen, closed period | The intent FAILS, and a human has to deal with money the rail already moved |
| 5xx / network | **We don't know** | The intent is *not* failed. Re-thrown, so the rail retries; the idempotency key makes the retry safe |

Marking an intent FAILED on a don't-know would be a lie about money that has
already left somebody's bank.

## Telling the customer: the outbox

```
BEGIN  →  mark intent SETTLED/FAILED (+ invoice PAID)  →  INSERT outbox  →  COMMIT  →  relay → notifications
```

The event that drives the email and the in-app toast is a row in `outbox`,
written **in the same transaction** as the status change it announces. It
used to be a best-effort POST made after the fact, so notifications being down
at the moment of settlement meant the customer was simply never told. Now the
intent cannot say SETTLED without its `payment.settled` event existing, and an
outage delays the email rather than dropping it.

`OutboxRelay` delivers rows to notifications' `POST /internal/events`:

- **Kicked after every commit** that wrote an event, so the toast still
  arrives while the page is open, and **swept on a timer**
  (`OUTBOX_RELAY_SECONDS`), so a row nobody kicked is still found.
- **Backoff** of 1s doubling to a 5-minute cap; `OUTBOX_MAX_ATTEMPTS` (100,
  roughly eight hours) before a row is marked `DEAD`. A 4xx other than
  408/429 is DEAD at once — notifications saying an event is malformed will
  say so forever.
- **At-least-once.** The row id travels as `dedupeKey`; notifications'
  delivery log and webhook queue are UNIQUE on it, so a replay tells nobody
  twice.
- **Safe on every replica**: rows are claimed `FOR UPDATE SKIP LOCKED`, with
  the claim pushing `next_attempt_at` out as a lease, so a relay that dies
  mid-delivery leaves its rows due again rather than stuck.

An empty `NOTIFICATIONS_URL` is allowed: events queue and are delivered once
it is set.

```sql
-- What's owed, and what was given up on.
SELECT status, count(*) FROM outbox GROUP BY status;
SELECT id, event, party_id, attempts, last_error FROM outbox WHERE status = 'DEAD';
-- Retry a DEAD row once the cause is fixed.
UPDATE outbox SET status = 'PENDING', attempts = 0, next_attempt_at = now() WHERE id = '<id>';
```

Tests: `pnpm --filter @damp/payments test` runs `test/outbox.e2e-spec.ts`
against `payments_test` (override with `PAYMENTS_TEST_DATABASE_URL`) — never
the dev database.

## Rails

`RailProvider` is three methods: `collect`, `disburse`, `parseCallback`. Its
shape is asynchronous **even for the stub**, and that is the point:

- **`StubRail`** settles instantly, but *through its own callback*, against
  the same endpoint M-Pesa posts to. A stub that returned `{status: 'SETTLED'}`
  inline would leave the settlement path — the code that decides money moved —
  completely untested until a real rail was plugged in. It also fails on
  demand: an amount ending in `.13` is rejected, because a payments service
  whose demo data always succeeds has a failure path nobody has run.
- **`MpesaRail`** talks to Safaricom's Daraja sandbox (STK Push to collect,
  B2C to disburse). Chosen because it is free and self-service, which is the
  plan's test for whether a real integration belongs in a phase at all. KES is
  already a seeded currency in core-ledger.

Unconfigured M-Pesa is a normal state: `RailRegistry` falls back to the stub
and logs that it has, rather than 500-ing a route the frontend already calls.

```bash
# Deposit through the stub rail. It settles about 250ms later, via a callback.
curl -sX POST localhost:3003/payment-intents \
     -H 'Content-Type: application/json' -H 'X-User-Id: party_1' \
     -H 'Idempotency-Key: demo-1' \
     -d '{"direction":"DEPOSIT","amount":"250.00","currency":"USD"}' | jq .

# Same key again: the existing intent comes back, and the rail is not called
# twice. A second STK push would prompt the customer twice for one payment.
```

## Bank accounts

The `/banks/*` routes are not new API design — they are the endpoints
`frontend/src/redux/slices/bankAccountsSlice.ts` has been written against
since before this service existed, falling back to mock data on every one of
them. The shapes match what those thunks expect.

**Only the last four digits of an account number are stored.** Once the rail
has its own opaque handle the number is a credential for the customer's bank
relationship and nothing more, and a payments service that keeps one is a
payments service that can leak one. There is no endpoint that can reveal it,
which is why the frontend's "reveal account number" toggle went away with the
mocks — it was revealing fixtures.

`PENDING` → `VERIFIED` stays a separate step even though the stub could verify
inline. A withdrawal may only target a VERIFIED account; paying out to one
nobody has proved they control is the mistake the distinction exists to
prevent.

## Invoices and payment links

An invoice carries a `pay_token` — 24 bytes of entropy, `base64url`. It is a
bearer credential for paying exactly that invoice and nothing else, it only
resolves while the invoice is OPEN, and voiding clears it. That is what makes
voiding a revocation rather than a label.

`GET /invoices/pay/:token` is deliberately unauthenticated and deliberately
absent from the gateway's route table: the whole point of a payment link is
that somebody without an account can open it.
