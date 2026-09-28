# services/rms

Reserve management and treasury: custodians, statements, reserve targets, fee
schedules and attestations.

**The one thing it exists for:** `POST /reserves/custodian-snapshots` to
core-ledger. That is the writer `trust_bank_snapshot` never had — its only
documented writer was a "Bank Adapter service (not part of this repo)" that
does not exist — and it is why reconciliation's **Leg C was skipped on every
run this platform has ever performed**. R7 in the risk register puts it
plainly: the one control catching an unbacked mint was decorative.

## Running it

```bash
cp .env.example .env
pnpm --filter @damp/rms start:dev
```

Needs its own Postgres database (`infra/postgres/init/02-p3-databases.sql`,
applied on a fresh volume — `docker compose down -v && make up`).

## What it owns, and what it doesn't

It holds **no balance anyone spends**. The one number that matters downstream
— what a custodian says it holds — is POSTed to core-ledger and lives there,
because the ledger is the only place value exists. What lives here is the
workflow state around it: which custodians exist, what they last said, what
policy says they should hold, and what the platform publishes about it.

## The demo that makes the control believable

A reconciliation leg nobody has ever seen break is a leg nobody knows works.
`StubCustodianProvider` reports core-ledger's own cash position **plus a
configurable drift**, so with drift at zero Leg C passes for the right reason,
and the demo is "change one number and watch a control fire" rather than
"watch a control fire because the fake data never agreed with anything".

```bash
# Arm the DoD's $1,000 shortfall. This also forces an immediate report, so
# the break is open by the next reconciliation run rather than the next poll.
curl -sX POST localhost:3005/custodians/primary/drift \
     -H 'Content-Type: application/json' -d '{"drift":"-1000.00"}' | jq .

make reconcile          # exits 2, and LEG_C/CUSTODIAN_SHORTFALL is open
curl -s localhost:8081/reserves/reconciliation-breaks | jq .

# Heal it. The break auto-resolves on the next run — a break is a statement
# about the world, and when the world stops being that way the row says so
# without anyone clicking anything.
curl -sX POST localhost:3005/custodians/primary/drift \
     -H 'Content-Type: application/json' -d '{"drift":"0"}' | jq .
make reconcile          # exits 0
```

## Endpoints

| | |
|---|---|
| `GET /reserves/status` | the treasury view: issuance, backing, cash, coverage ratio, open breaks |
| `GET /reserves/targets`, `PUT /reserves/targets/:currency` | policy — minimum ratio and buffer |
| `GET /custodians` | including each one's armed drift, deliberately |
| `GET /custodians/:id/statements` | what it said, when, and whether the ledger has been told |
| `POST /custodians/:id/poll` | report now |
| `POST /custodians/:id/drift` | arm/disarm the stub's drift (treasury-only) |
| `GET/POST /attestations`, `POST /attestations/:id/publish` | the published claim |

`GET /custodians` surfaces the armed drift on purpose: a treasury console that
shows a shortfall without showing that somebody armed a demo drift is a
console that starts an incident.

`POST /attestations` **refuses** while a reconciliation break is open, unless
the caller passes `acknowledgeBreaks: true` (which records the breaks on the
attestation). Publishing "our reserves are fine" while a control says they are
not is the one thing an attestation must never be able to do by accident.

## Money

`src/money/money.ts` is the only place this service does arithmetic. Amounts
are decimal strings; arithmetic happens on scaled `BigInt`s; nothing is ever
coerced with `parseFloat`. `0.1 + 0.2` is not `0.3` in binary floating point,
and a custodian balance off by 1e-17 makes Leg C report a shortfall of a
fraction of a cent on every run, forever. `test/money.spec.ts` asserts exactly
those cases.
