# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## 2026-09-18

### Added
- **Double-entry ledger in `core-ledger`.** The service previously had no ledger:
  one bridge-workflow table and three read-only snapshot tables, with no way to
  answer "what is user X's balance?". Added, all in `internal/ledger/`:
  - `models.go` — `Currency`, `Account`, `Transaction`, `JournalEntry`,
    `LedgerClosure`, `Wallet`, `FxQuote`. `BridgeTransfer` is demoted from
    record-of-value to saga state and now links back to the journal.
  - `chart.go` — hierarchical chart of accounts with materialized paths,
    `HEADER`/`DETAIL` postability, deterministic account ids derived from GL
    codes so seeding is idempotent across environments.
  - `posting.go` — the posting engine: per-currency balance validation, closed
    period checks, overdraft guard, running-balance computation and insert, all
    inside one `SERIALIZABLE` transaction with retry on 40001/40P01. Reversal by
    contra-entry.
  - `flows.go` — deposit, withdrawal, internal transfer, FX conversion, USD-X
    issuance and redemption, and the bridge legs.
  - `fx.go` — quote model and exact integer conversion arithmetic (multiply
    first, divide once, truncate toward zero).
  - `wallets.go`, `balances.go` — wallet lifecycle, balance reads, trial
    balance, statements, and running-balance verification.
  - `migrations/00003_ledger_core.sql` — the schema, including a trigger that
    makes `journal_entries` append-only at the database level.
- 36 tests: unit coverage of the balance rules, FX arithmetic and chart
  invariants, plus integration tests against real PostgreSQL covering the
  issuance lifecycle, bridging through suspense, FX, redemption, reversal,
  idempotency, overdraft rejection, period closure and the append-only trigger.
  Integration tests skip unless `LEDGER_TEST_DATABASE_URL` is set.
- New API surface: wallets, deposits, withdrawals, transfers, FX quotes and
  conversions, issuances, redemptions, bridges, transaction lookup and
  reversal, account balances, trial balance, ledger integrity, period closures.
- USD-X SPL mint created on Solana devnet (`74LLkb4atWtfPjUExAgZDLNryEozMB5F4dwm1K3Q3wXE`), mint
  authority assigned to the `usdx_bridge` program's PDA (`3ffFTA2zzQujuDuaPaX2s8HjgXoQHGzJLNmVDLfMRfPB`).
- `chains/solana/scripts/initialize-mint.ts`, `import-keypair.ts`, `export-keypair.ts` — key
  management and one-off mint setup scripts.
- `chains/solana/README.md` — documents the Solana deployment, the Mint-account vs. Program-account
  split, wallet roles, and the deploy procedure.
- Root `README.md` — full-system overview: DAMP context, service layout, the burn/mint saga flow
  through `core-ledger`, the per-chain minting-authority comparison table, and wallet funding notes.
- This changelog.

### Updated
- `chains/ethereum/README.md` — replaced the generic Foundry boilerplate with USDX-specific content:
  deployed Sepolia addresses (proxy/implementation), the proxy-vs-implementation architecture
  explanation, the `AccessControlUpgradeable` role table, and deploy steps. Kept the Foundry command
  reference at the bottom.

### Changed
- **Breaking: `POST /mint` is replaced.** Fiat → USD-X is now `POST /issuances`
  (fiat wallet → USD-X wallet); moving existing USD-X between chains is
  `POST /bridges`. Every write now requires an `Idempotency-Key` header — the
  old endpoint generated a correlation id server-side, so a client retry
  double-minted.
- `DecimalAmount` no longer parses at a hard-coded 6 decimal places. It holds the
  wire string until a `Currency` says what scale it is, because "10.00" is 1000
  in USD and 10000000 in USD-X, and "10.001" is a client bug in USD rather than
  a third cent place to truncate away.
- `bridge.Saga` posts journal entries at each state transition, and reserves
  funds in the ledger *before* burning on chain. A failed burn now reverses the
  reservation; a failed issuance mint reverses the issuance so the user's fiat
  comes back.
- `reconciliation.Job` is a three-way check (ledger / chains / custodian)
  against the journal instead of a two-way comparison that netted out in-flight
  transfers by scanning workflow rows. Cross-chain value in flight is now the
  balance of the bridge suspense account.
- Fineract stays rejected as the ledger *engine*, but its accounting model is
  now the explicit reference for the journal's design — GL hierarchy,
  `HEADER`/`DETAIL`, reversal-by-contra-entry, running balances on the entry
  row, `entity_type`/`entity_id` back-references, and period closures.
- `chains/solana/programs/usdx_bridge/src/constants.rs`: replaced the placeholder `RELAYER_PUBKEY`
  (previously the System Program's address, which would reject every signer) with the real
  relayer account (`257pTZ4CBDLmQrdwpSHC6ahrJkxSaQFFEohpeXD3H3FJ`), parsed at runtime via
  `relayer_pubkey()` since this anchor-lang version has no compile-time base58 pubkey macro.
- `chains/solana/Anchor.toml`: added a `[programs.devnet]` entry and switched `provider.cluster`
  from `localnet` to `devnet`.
- `bridge_mint.rs` / `bridge_burn.rs`: updated the relayer signer constraint to call
  `relayer_pubkey()` instead of referencing the old `const`.

### Deployed
- `usdx_bridge` Anchor program deployed to Solana devnet at
  `9GFGtYxGtZg8Smk4yyya7zAT6V3WcLDsB9XWWQbxMS8`, upgrade authority held by the deployer wallet
  (`Hz7NgWBQviCuNgrgG2QG5DXXArQdoCrvenTdL71bY7ph`).

### Notes
- Relayer wallet (`257pTZ4CBDLmQrdwpSHC6ahrJkxSaQFFEohpeXD3H3FJ`) is funded to only 0.025 SOL on
  devnet — sufficient for a handful of transactions but needs topping up before sustained
  relay/bridge activity, since it pays the fee for every `bridge_mint`/`bridge_burn`.
- Ethereum side (`chains/ethereum`) already had its UUPS-upgradeable `USDX` contract deployed to
  Sepolia prior to this work — proxy at `0xba07d67285721d6ad906c631dc945b5dab6a7e5c`, implementation
  at `0x535cf7ecb1018a523547df7be4ba29a595fb90f0` — no changes made there in this pass.
