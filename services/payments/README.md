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
