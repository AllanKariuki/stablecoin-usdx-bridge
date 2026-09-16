# USD-X Bridge

Dual-chain stablecoin bridge: an upgradeable ERC-20 on Ethereum and an SPL
Token counterpart on Solana, kept in sync by an off-chain Core Ledger that
runs a burn-on-source / mint-on-destination saga and reconciles circulating
supply against a trust bank reserve.

## Layout

- `chains/ethereum` — Foundry project, UUPS upgradeable ERC-20 (`USDX.sol`)
- `chains/solana` — Anchor workspace, SPL mint owned by a PDA
- `core-ledger` — Go service: mint API, saga orchestrator, reconciliation job
- `shared` — ABI / proto artifacts consumed by core-ledger and any frontend
- `infra` — k8s manifests and Keycloak realm config

## Local dev

```bash
docker compose up -d              # Postgres (+ add anvil/solana-test-validator as needed)
cd chains/ethereum && forge test
cd chains/solana && anchor test
cd core-ledger && go run ./cmd/server
```

See the step-by-step build order for the recommended order to bring these up.
