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

- `--fast` — skip the on-chain steps (`issuance`, `bridge`, `redeem-eth`,
  `redeem-sol`) and the chain-supply reads. The `break-glass` step runs in
  both modes but self-skips in `--fast`: it needs a redemption whose saga is
  in flight, creating one is on-chain money, and the gateway exposes no list
  of pending redemptions to pick one from (the dead-letter queue is not
  gateway-reachable).
- `--only=<step,...>` — run only the named steps, in order
  (`wallets, deposit, p2p, invoice, withdrawal, issuance, bridge, redeem-eth,
  redeem-sol, break-glass, negatives, reconcile`). The redeem steps look their
  wallets and balances up from the API, so `--only=redeem-eth` runs standalone;
  it fails with a clear message when the ETH USD-X balance is below the
  redemption amount. `redeem-sol` is reported SKIP (not FAIL) when the bridge
  step did not complete and the customer therefore holds no Solana USD-X.
  `break-glass` runs standalone in full mode when the customer holds ≥ 5.00
  USD-X on Ethereum; it self-skips otherwise.
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
8. **redeem-eth** *(full)* — 10 USD-X redeemed on Ethereum; supply -10, fiat
   +10.
9. **redeem-sol** *(full)* — 10 USD-X redeemed on Solana; supply -10, fiat
   +10. Skipped with a reason when the bridge step did not complete (nothing
   to burn on Solana).
10. **break-glass** *(full; self-skips in --fast)* — the H4 maker-checker
    control, on the negative path only: a fresh 5.00 redemption is proposed
    for break-glass with a random fake hash by treasury (202 PENDING_APPROVAL,
    nothing settles); treasury cannot approve its own request (403); admin
    approves; the burn cannot verify, the status row reaches
    VERIFICATION_FAILED, the saga is not settled and no fiat moved. The
    worker still settles that redemption the ordinary way afterwards (a real
    burn, which is the happy path).
11. **negatives** — idempotent replay, overdraw refusal, cross-user/operator-only
    403s, 401s for missing/garbage tokens, 400 for a missing Idempotency-Key.
12. **reconcile** — runs the reconcile job once at the start and once at the
    end, then asserts Leg A's drift (on-chain supply − (issued − in transit))
    did not change across the run, so the ledger and the chains moved together.
    A pre-existing break is reported as KNOWN, not a failure; Leg B must be ok,
    and Leg C's "skipped (no custodian balance)" is reported rather than failed.

After every money step it also verifies the trial balance is balanced and the
ledger integrity check is healthy.

Amounts stay small; every money write uses a fresh Idempotency-Key except the
explicit replay test.
