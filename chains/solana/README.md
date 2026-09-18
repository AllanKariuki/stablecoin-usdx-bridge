# usdx-bridge — Solana

Anchor program implementing the Solana side of USD-X: DAMP's Stablecoin
Mint/Burn Service for the high-volume, sub-second, low-fee retail/payments
chain (Ethereum is the institutional/high-value settlement layer — see the
root-level DAMP architecture notes).

USD-X is a native SPL token on Solana, not a lock-and-mirror bridge: moving
value between chains is an atomic burn-on-source / mint-on-destination loop,
orchestrated by the Core Ledger, so total cross-chain supply always
reconciles to fiat reserves.

## Current deployment (devnet)

| Item | Address |
|---|---|
| Program ID (`usdx_bridge`) | `9GFGtYxGtZg8Smk4yyya7zAT6V3WcLDsB9XWWQbxMS8` |
| USD-X Mint | `74LLkb4atWtfPjUExAgZDLNryEozMB5F4dwm1K3Q3wXE` |
| Mint authority (program PDA, seed `"mint-authority"`) | `3ffFTA2zzQujuDuaPaX2s8HjgXoQHGzJLNmVDLfMRfPB` |
| Deployer / upgrade authority | `Hz7NgWBQviCuNgrgG2QG5DXXArQdoCrvenTdL71bY7ph` |
| Relayer (only signer `bridge_mint`/`bridge_burn` accept) | `257pTZ4CBDLmQrdwpSHC6ahrJkxSaQFFEohpeXD3H3FJ` |
| Cluster | `https://api.devnet.solana.com` |

`USDX_MINT_ADDRESS`, `RELAYER_PUBKEY`, `USDX_PROGRAM_ID`, etc. are kept in
`.env` (gitignored) — this table is the durable record of what's live.

## Architecture: Mint account vs. Program account

Unlike an ERC-20, an SPL token splits "code" and "data" into two separate
on-chain accounts:

- **Mint account** (`USDX_MINT_ADDRESS`) — pure data: decimals, total
  supply, mint/freeze authority. No executable code. Every holder's balance
  lives in their own Associated Token Account (ATA), derived from
  `(owner, mint)` — not in the mint itself.
- **Program account** (`USDX_PROGRAM_ID`) — the actual `bridge_mint` /
  `bridge_burn` logic, and the thing that's upgradeable (native Solana
  `BPFLoaderUpgradeable`, authority = the deployer wallet). This is the
  closer analogue to Ethereum's upgradeable proxy pattern — a fixed address
  with swappable logic behind it — not the mint.

Minting is centralized by design: the mint's authority is the program's PDA,
and the program itself only accepts one signer as `relayer` (checked via
`relayer_pubkey()` in `constants.rs`, enforced in both `bridge_mint.rs` and
`bridge_burn.rs`). In production this relayer is driven by the Core Ledger's
Stablecoin Mint/Burn Service, gated on RMS confirming fiat backing — "many
users minting" means many `bridge_mint` calls from that one relayer, not
multiple independent minting authorities.

Replay protection: every mint/burn carries a `processed_marker` PDA so a
given transfer can't be double-processed — mirrored on the Ethereum side by
`processedMints`/`processedBurns` mappings keyed on the same `correlationId`.

## Wallets

- **Deployer** — pays for program deployment (buffer + program account
  rent-exemption, currently ~0.97 SOL rent-exempt minimum for this program's
  ~187KB binary) and one-off setup transactions (`initialize-mint`). Mostly
  a one-time cost, plus a buffer for future program upgrades.
- **Relayer** — fee-payer for every `bridge_mint`/`bridge_burn` it submits,
  plus rent-exemption for any recipient ATA it has to create. This is an
  ongoing operational cost, not one-off — needs continuous top-ups/sweep
  monitoring in production (DAMP's hot-wallet tier).

## Setup / deployment (devnet)

```bash
npm install

# 1. Confirm the deployer keypair matches the address you expect
solana-keygen pubkey ~/.config/solana/id.json

# 2. Build (produces target/deploy/usdx_bridge.so + program keypair)
anchor build

# 3. Fund the deployer if needed
solana airdrop 2 <deployer_pubkey> --url https://api.devnet.solana.com

# 4. Deploy the program
anchor deploy --provider.cluster devnet --provider.wallet ~/.config/solana/id.json

# 5. Verify
solana program show <program_id> --url https://api.devnet.solana.com

# 6. Create the USD-X mint and hand mint authority to the program PDA
#    (one-off per cluster — see scripts/initialize-mint.ts)
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
npm run init-mint

# 7. Copy the printed USDX_MINT_ADDRESS into .env
```

## Scripts (`scripts/`)

- `initialize-mint.ts` — one-off: creates the SPL mint, hands mint authority
  to `usdx_bridge`'s PDA. Run once per cluster deploy.
- `import-keypair.ts` / `export-keypair.ts` — move a keypair in/out of the
  Solana CLI's on-disk JSON format (e.g. for the relayer key referenced by
  `SOLANA_RELAYER_KEYPAIR_PATH`).

## Relationship to Ethereum

Both chains keep exactly one canonical address per role — one token
identity, one relayer — reconciled through the shared Core Ledger:

| | Solana | Ethereum |
|---|---|---|
| Token identity | Mint account | ERC1967 Proxy address |
| Upgradeable logic | Program account | Implementation contract (behind the proxy) |
| Balances stored in | Per-owner ATAs | Proxy's own storage (`mapping`) |
| Minting gated by | Single relayer pubkey (`relayer_pubkey()`) | Single relayer address (`BRIDGE_ROLE`) |
| Decimals | 6 (`USDX_DECIMALS`) | 6 (overridden from ERC20's default 18) to match |
