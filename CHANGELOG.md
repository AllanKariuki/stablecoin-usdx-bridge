# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## 2026-09-25

### Added
- **`services/identity`** (NestJS) — the last unbuilt P1 service from
  `docs/building-plan.md`. Owns parties, orgs and memberships in its own
  Postgres database (`migrations/001_parties_orgs_memberships.sql`, applied
  by a small hand-rolled migration runner — `pg` + a `schema_migrations`
  table, not a new ORM/migration framework for one table set; see
  `src/db/migration-runner.ts`'s doc comment for why this isn't goose).
  - **Just-in-time provisioning**, not a separate signup endpoint: the
    first time `services/auth-proxy`'s `IdentityHTTPResolver` resolves a
    Keycloak subject it hasn't seen (`GET /internal/parties/by-subject/
    :subject`), identity calls the Keycloak Admin API (as the
    `identity-service` confidential client already provisioned in
    `infra/keycloak/realms/damp-realm.json`) to look up the user, creates a
    `PERSON` or (if the user carries an `org_id` attribute — a company
    login acting as itself) `ORGANIZATION` party plus an org + membership,
    and calls core-ledger's idempotent `POST /wallets` to ensure the
    default fiat wallet. A concurrent first-login for the same subject
    loses the race on `keycloak_subject`'s UNIQUE constraint and re-reads
    the winner's row rather than erroring. This closes the
    `SubjectPassthroughResolver` seam `services/auth-proxy` shipped with in
    the previous session's `internal/identityclient` package.
  - Party ids (`party_<uuid>`) are intentionally **not** the raw Keycloak
    subject — core-ledger's `wallets.user_id` treats the party id as an
    opaque key per the plan's "Identity is three layers" decision. One
    practical consequence: any wallet created earlier under the passthrough
    resolver (keyed by the raw subject) becomes unreachable once
    `IDENTITY_SERVICE_URL` is set on auth-proxy — expected for a dev/demo
    environment reseeded from `damp-realm.json` on every fresh Keycloak
    start; reset the Postgres volume (`docker compose down -v`) for a clean
    demo rather than trying to re-key old rows.
  - Tested against real Postgres with a fake Keycloak + fake core-ledger
    (real HTTP servers, same pattern as `services/bff`'s own
    `FakeCoreLedger`) — 7 tests: PERSON/ORGANIZATION provisioning, the
    default-wallet-ensure call, idempotent re-resolution, and the migration
    runner's own apply-once behavior.
- **`infra/postgres/init/01-identity-db.sql`** — creates identity's own
  Postgres role + database (`identity`) and a separate test database
  (`identity_test`), mounted into the postgres container via
  `docker-entrypoint-initdb.d/` (only applied on a fresh volume — an
  existing local `pgdata` needs `docker compose down -v && make up`).
- **`infra/k8s/identity-{deployment,service,networkpolicy}.yaml`** —
  mirrors `auth-proxy`'s manifests; the NetworkPolicy restricts ingress to
  the `auth-proxy` pod only, identity's one real consumer today.
  `core-ledger-networkpolicy.yaml` gains identity as a second allowed
  caller (`POST /wallets`), alongside `bff`.
- **CI: a `node` job** (`.github/workflows/ci.yml`) — `pnpm -r test/lint/
  typecheck` across `shared/node/nest-platform`, `services/bff` and
  `services/identity`, with a Postgres service container for identity's
  specs. `nest-platform` and `bff` had zero CI coverage before this (their
  own prior sessions never wired a Node job in); this closes that gap as a
  side effect of adding identity's own.
- **`make test-node`** (folded into `make test`) and `pnpm -r lint` folded
  into `make lint` — the Node-workspace equivalents of `test-unit`/
  `test-integration`.

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
