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
| `core-ledger` | Go service (Fiber): mint API, burn/mint saga orchestrator, reserve reconciliation job |
| `shared` | Generated ABI (`shared/abi`) and gRPC/proto contracts (`shared/proto`) shared across services |
| `infra` | Kubernetes manifests and the Keycloak realm (IAM/OAuth2) config |

## How a cross-chain transfer actually moves

1. A client calls `POST /mint` on `core-ledger` (`core-ledger/internal/api/handlers.go`)
   with a `user_address`, decimal-string `amount`, source chain, and target
   chain (see `shared/proto/bridge.proto` for the wire shapes).
2. `bridge.Saga.Execute` (`core-ledger/internal/bridge/saga.go`) picks the
   right chain clients via `bridge.Router` (`ETHEREUM` → `chainclients/ethereum`,
   `SOLANA` → `chainclients/solana`), then:
   - burns on the source chain,
   - mints on the destination chain,
   - on mint failure, compensates by reversing the burn rather than leaving
     supply in a partial state.
3. Every step is idempotent — a client-supplied `correlationId`
   (`bridge.CorrelationIDHash`) is checked against `processedMints`/`processedBurns`
   on Ethereum and a `processed_marker` PDA on Solana, so retries can never
   double-mint or double-burn.
4. `reconciliation.Job.RunForever` (`core-ledger/internal/reconciliation/job.go`)
   runs on a timer, comparing on-chain circulating supply (both chains) against
   recorded trust-bank reserves, and is where Proof-of-Reserves would be signed off.
5. Every movement is a Core Ledger journal entry — double-entry, `SERIALIZABLE`
   isolation on Postgres/CockroachDB, balances always *derived* from entries,
   never stored as a mutable column. (Apache Fineract was evaluated and
   rejected for this: too heavy for the P95 ≤100ms latency SLA and prone to
   deadlocks under `SERIALIZABLE`.)

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
docker compose up -d              # Postgres (+ add anvil/solana-test-validator as needed)
cd chains/ethereum && forge test
cd chains/solana && anchor test
cd core-ledger && go run ./cmd/server
```

After building the Ethereum contract, copy its ABI into `shared/abi/USDX.json`
so `core-ledger`'s `abigen` step and any frontend stay on one source of truth.

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
