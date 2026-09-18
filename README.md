# USD-X Bridge

Dual-chain stablecoin bridge and the working implementation of a subset of
**DAMP** (Digital Assets Management Platform) — a microservices platform
bridging TradFi and digital assets, centered on a fiat-backed stablecoin
called **USD-X**.

USD-X is issued 1:1 against fiat reserves held in segregated trust-bank
accounts. It is deployed **natively on both chains** — an upgradeable ERC-20
on Ethereum and an SPL token on Solana — not as a lock-and-mirror bridge.
Ethereum is the institutional/high-value settlement layer; Solana is the
high-volume, sub-second, low-fee retail/payments layer. Moving USD-X between
them is an atomic **burn-on-source / mint-on-destination** loop, orchestrated
by the Core Ledger and recorded as one internal movement, so total
cross-chain supply always reconciles to bank reserves.

## Layout

| Path | What it is |
|---|---|
| [`chains/ethereum`](chains/ethereum/README.md) | Foundry project — UUPS-upgradeable ERC-20 (`USDX.sol`), proxy + implementation |
| [`chains/solana`](chains/solana/README.md) | Anchor workspace — SPL mint owned by a program PDA |
| `core-ledger` | Go service (Fiber): double-entry ledger (accounts, wallets, journal), fiat/FX/issuance/redemption flows, burn/mint saga orchestrator, reserve reconciliation job |
| `shared` | Generated ABI (`shared/abi`) and gRPC/proto contracts (`shared/proto`) shared across services |
| `infra` | Kubernetes manifests and the Keycloak realm (IAM/OAuth2) config |

## The ledger

`core-ledger` is a double-entry ledger first and a bridge orchestrator second.
Nothing moves value except by posting a balanced journal entry.

- **Chart of accounts** (`internal/ledger/chart.go`) — a hierarchy of GL accounts
  where only leaf (`DETAIL`) accounts are postable and `HEADER` accounts roll
  their subtree up for reporting. A customer's balance is a `LIABILITY`; the
  custodian cash behind it is an `ASSET`.
- **Wallets** (`internal/ledger/wallets.go`) — the product object in front of a
  liability account, one per (user, currency, chain). A user holding USD-X on
  both chains has two wallets, which makes a bridge a movement between two of
  their own accounts.
- **Journal** (`internal/ledger/posting.go`) — append-only, enforced by a
  database trigger. Amounts are always positive and the direction carries the
  sign; a correction is a reversal (contra-entry), never an edit. Each line
  carries the account's running balance, so a current balance is an O(1) read
  with no mutable balance column anywhere.
- **Multi-currency** — a transaction balances *per currency*, not in aggregate.
  An FX conversion's two legs are different units and can never sum to zero
  together; the difference lands in per-currency FX position accounts, which is
  where the house's currency exposure becomes visible rather than hidden in a
  rounding difference.
- **Flows** (`internal/ledger/flows.go`) — deposit, withdrawal, transfer, FX
  conversion, USD-X issuance and redemption, and the bridge legs, each
  expressed as the journal it produces.

Apache Fineract was evaluated and rejected as the *engine* (too heavy for the
P95 ≤100ms latency SLA, prone to deadlocks under `SERIALIZABLE`), but its
accounting model is the reference this one is built on: the GL hierarchy and
`HEADER`/`DETAIL` split, reversal-by-contra-entry with a `reversed` flag and
cross-link, running balances on the entry row, the `entity_type`/`entity_id`
back-reference from a journal line to the domain object that caused it, and
period closures that reject back-dated posts.

## How money actually moves

1. **Fiat in.** `POST /deposits` credits the user's fiat wallet against the
   custodian account.
2. **FX, if needed.** `POST /fx/quotes` records a rate; `POST /fx/conversions`
   applies it between two of the user's fiat wallets. USD-X is issued 1:1
   against USD, so a KES holder converts to USD first.
3. **Issuance.** `POST /issuances` turns a USD claim into a USD-X claim. The
   cash never leaves the custodian — what changes is the shape of the claim on
   it. The USD-X is *not* credited to the user's wallet yet: it sits in the
   in-transit suspense account until the chain mint confirms, because the
   tokens genuinely do not exist on chain yet.
4. **The saga.** `bridge.Saga.Execute` (`core-ledger/internal/bridge/saga.go`)
   picks the right chain clients via `bridge.Router` (`ETHEREUM` →
   `chainclients/ethereum`, `SOLANA` → `chainclients/solana`), mints on the
   destination, and on finality posts the journal entry releasing the USD-X
   from suspense into the user's wallet. The ledger leg always precedes the
   chain leg it represents, so a crash between them leaves value visibly parked
   in suspense rather than silently doubled or lost.
5. **Cross-chain.** `POST /bridges` moves a user's existing USD-X between their
   own chain wallets: burn on the source, mint on the destination, with the
   journal moving it wallet → suspense → wallet. No supply is created or
   destroyed. On a failed destination mint the saga re-mints on the source and
   posts a compensating entry.
6. **Redemption.** `POST /redemptions` parks the USD-X pending burn;
   `POST /redemptions/{id}/confirm` releases the fiat once the burn is final.
   Paying out before the burn settles would let a user who front-runs the chain
   spend the same value twice.
7. **Idempotency.** Every write requires a client-supplied `Idempotency-Key`
   header, unique-indexed on `transactions`; a retry returns the original
   transaction. On chain, a correlation id (`bridge.CorrelationIDHash`) is
   checked against `processedMints`/`processedBurns` on Ethereum and a
   `processed_marker` PDA on Solana, so retries can never double-mint.
8. **Reconciliation.** `reconciliation.Job.RunForever` runs on a timer and
   proves three things agree, reporting which leg broke:

   | Leg | Check |
   |---|---|
   | A | ledger says issued == on-chain supply + in transit |
   | B | reserve backing == ledger says issued (the 1:1 peg) |
   | C | custodian statement >= ledger says is in the bank |

   `GET /ledger/trial-balance?currency=USD` and `GET /ledger/integrity` are the
   two endpoints a monitor should poll: the first proves debits equal credits,
   the second re-derives every account's balance from its entries and reports
   any that disagree with the running balance the posting engine wrote.

## Minting authority: centralized by design, on both chains

There is exactly **one** relayer identity per chain, and only that identity
can mint or burn — end users never hold minting rights directly, no matter
how many of them are transacting:

| | Ethereum | Solana |
|---|---|---|
| Token identity (the address to use) | ERC1967 Proxy | Mint account |
| Upgradeable logic lives in | Implementation contract, behind the proxy | Program account (`BPFLoaderUpgradeable`) |
| Balances stored in | Proxy's own storage (`mapping`) | Per-owner Associated Token Accounts |
| Minting gated by | Single address holding `BRIDGE_ROLE` | Single pubkey checked by `relayer_pubkey()` |
| Decimals | 6 (overridden from ERC20's default 18) | 6 (`USDX_DECIMALS`) |

Both relayers are meant to be driven by `core-ledger`'s Saga, gated on the
reconciliation job confirming reserve backing — "many people minting" in
production means many `bridgeMint`/`bridge_mint` calls issued by that one
relayer per chain, not multiple independent minting authorities. See each
chain's README for the full breakdown and current deployed addresses.

## Wallets you need to fund

- **Deployer** (per chain) — one-off cost: contract/program deployment and
  initial setup (e.g. Solana's `initialize-mint`). Keep a small buffer for
  future upgrades.
- **Relayer** (per chain) — ongoing cost: pays gas/fees for every
  `bridgeMint`/`bridge_mint` and `bridgeBurn`/`bridge_burn` call. This is the
  wallet to put on a sweep/top-up monitor in production — per DAMP's wallet
  tiering (Hot/MPC-HSM, Warm/multi-sig, Cold/air-gapped), this is a Hot wallet.

## Local dev

```bash
make hooks-install   # once per clone: installs the pre-commit secret scan
                      # (requires `brew install gitleaks`)
make up               # Postgres (+ add anvil/solana-test-validator as needed)
make test              # Go (unit + integration), Foundry, Anchor/litesvm — everything
make run               # core-ledger against local infra (needs core-ledger/.env)
```

See `make` (no target) for the full list, or the Makefile itself — `test-unit`,
`test-integration`, `test-eth`, `test-sol` run each suite individually, and
`lint`/`fmt`/`fmt-check` cover formatting across all three languages.
`chains/ethereum/README.md` and `chains/solana/README.md` have the exact
commands `make test-eth`/`test-sol` wrap, including why `anchor build` needs
`--arch v1 --ignore-keys` rather than its own defaults.

After building the Ethereum contract, copy its ABI into `shared/abi/USDX.json`
so `core-ledger`'s `abigen` step and any frontend stay on one source of truth
— `shared/abi/USDX.json` is a tracked file, not a build artifact, and CI's
`ci.yml` fails if it drifts from `chains/ethereum/out/USDX.sol/USDX.json`.

## Other services in the full DAMP spec (not yet in this repo)

This repo currently implements Core Ledger + both chain adapters + IAM +
k8s scaffolding. Per the DAMP spec, the fuller platform also calls for: an
On-Chain Indexer & Listener (TimescaleDB), an API Gateway/edge cache (Redis
Cluster + Kong/Envoy/NGINX), a Payment Gateway & Invoicing service, a
standalone Reserve Management System (RMS) with an immutable audit ledger,
a Key Management & Signing Service isolated in its own DMZ (HSM/MPC, never
exports plaintext keys), and third-party integrations for KYC/AML/KYT
(Chainalysis/Elliptic/Onfido/SumSub), custody (Fireblocks/BitGo/Anchorage),
and node access (Alchemy/Infura/QuickNode).

## More detail

- [`chains/ethereum/README.md`](chains/ethereum/README.md) — proxy/implementation split, roles, deploy steps
- [`chains/solana/README.md`](chains/solana/README.md) — mint/program split, wallet roles, deploy steps
- [`CHANGELOG.md`](CHANGELOG.md) — dated log of what's changed
