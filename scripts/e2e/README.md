# E2E money-flow harness

`money-flows.mjs` drives the running local stack through the public gateway
(`http://localhost:18082/api`) exactly as a real client would, and asserts the
ledger and the chains stay consistent after every money movement.

It moves real testnet funds. **Run only against a stack you can throw away.**

## Prerequisites

- The stack is up (`make stack-up` / `scripts/stack.sh up`): Traefik,
  auth-proxy, bff, core-ledger, payments, worker, indexer.
- Keycloak reachable on `:8080` (realm `damp`, client `damp-portal`).
- For the full (on-chain) run:
  - Sepolia ETH in the relayer account (`ETH_RELAYER_PRIVATE_KEY` in
    `core-ledger/.env`) and the `BRIDGE_ROLE` on the USD-X contract.
  - Devnet SOL in the Solana relayer keypair
    (`SOLANA_RELAYER_KEYPAIR_PATH`).
  - `cast` (Foundry) on `PATH` for the Ethereum supply reads.

## Run

```sh
node scripts/e2e/money-flows.mjs            # full run, ~45-60 min (moves testnet funds)
node scripts/e2e/money-flows.mjs --fast     # fiat-only, ~1 min (no on-chain legs)
make e2e                                    # same as the full run
make e2e-fast                                # same as --fast
```

## Flags

- `--fast` — skip the on-chain steps (`issuance`, `bridge`, `redeem`) and the
  chain-supply reads.
- `--only=<step,...>` — run only the named steps, in order
  (`wallets, deposit, p2p, invoice, withdrawal, issuance, bridge, redeem,
  negatives, reconcile`).
- `--timeout-min=<N>` — saga poll timeout in minutes (default 40).

## What it checks

1. **wallets** — customer + company USD fiat wallets; customer USD-X wallets on
   Ethereum and Solana.
2. **deposit** — 200.00 USD via a stub-rail payment intent; balance rises by the
   exact posting; a ledger transaction exists.
3. **p2p** — customer → company 10.00 USD via an internal TRANSFER intent.
4. **invoice** — company issues 7.50 USD, customer pays it, invoice reaches PAID.
5. **withdrawal** — 5.00 USD to a verified stub-rail bank account.
6. **issuance** *(full)* — 50.00 USD-X minted on Ethereum; on-chain supply +50.
7. **bridge** *(full)* — 20 USD-X Ethereum → Solana; both supplies move.
8. **redeem** *(full)* — 10 USD-X redeemed from each chain; supplies -10 each.
9. **negatives** — idempotent replay, overdraw refusal, cross-user/operator-only
   403s, 401s for missing/garbage tokens, 400 for a missing Idempotency-Key.
10. **reconcile** — runs the reconcile job once at the start and once at the
    end, then asserts Leg A's drift (on-chain supply − (issued − in transit))
    did not change across the run, so the ledger and the chains moved together.
    A pre-existing break is reported as KNOWN, not a failure; Leg B must be ok,
    and Leg C's "skipped (no custodian balance)" is reported rather than failed.

After every money step it also verifies the trial balance is balanced and the
ledger integrity check is healthy.

Amounts stay small; every money write uses a fresh Idempotency-Key except the
explicit replay test.
