# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## 2026-09-28 — P3: on-chain truth

Branch `feat/p3-onchain-truth`. The phase's goal from `docs/building-plan.md`:
*a treasury operator sees live on-chain supply, circulation, in-transit,
reserve backing and custodian balance with all three legs green; force a drift
and a real alert appears in <60s.*

The theme underneath it is R7 — **the one control catching an unbacked mint
was decorative.** Reconciliation ran on a 5-minute in-process ticker, once per
API replica, and its only output was `log.Printf`. Nothing persisted, so "was
the platform balanced at 03:00 last Tuesday" had no answer; a break that
healed itself was indistinguishable from one nobody noticed; and Leg C had
been skipped on **every run this platform has ever performed**, because
`trust_bank_snapshot`'s only documented writer was a service that does not
exist.

### Added

- **`services/indexer`** (Go + TimescaleDB) — tails Sepolia and devnet,
  records blocks and events, and POSTs chain supply to core-ledger.
  - **Reorg handling as a pure function.** `internal/reorg` is hashes and
    heights with no database and no RPC client, so a fork can be fabricated in
    a unit test rather than needing an anvil and an `evm_revert`.
    `internal/tailer`'s tests index a mint, rewrite the chain underneath it,
    and assert the mint is un-believed — which is R9's mitigation, tested.
  - A fork deeper than `REORG_DEPTH` is **refused**, not absorbed: rewriting
    history the platform has already minted against is an incident, not a
    correction.
  - Nothing is ever deleted. An orphaned block or event is marked
    `canonical = false` and kept — a consumer that acted on it needs to be able
    to see what it acted on.
  - **`GET /finality/:chain/:txHash`** answers `UNSEEN` / `CONFIRMING` /
    `FINAL` / `ORPHANED`. The third value is the point: a boolean would
    collapse "orphaned" into "not seen yet", and a reorged mint would look
    identical to a slow one, which is what the saga used to wait forever on.
  - Leader election via a **Postgres advisory lock**, not the k8s Lease the
    plan called for. The lock lives in the same database as the cursor it
    protects, so it cannot be held by a process that has lost its connection to
    that state; a Lease is held in the API server, which a partitioned pod can
    keep renewing while unable to reach Postgres. It also means the indexer
    runs correctly under docker-compose, where there is no API server at all.
- **`services/rms`** (NestJS) — custodians, statements, reserve targets, fee
  schedules, attestations, and the `CustodianProvider` seam.
  `StubCustodianProvider` reports core-ledger's own cash position **plus a
  configurable drift**, so `POST /custodians/primary/drift {"drift":"-1000.00"}`
  is the DoD's shortfall and `"0"` heals it. A leg nobody has seen break is a
  leg nobody knows works.
  - `POST /attestations` refuses while a break is open unless the caller passes
    `acknowledgeBreaks: true`. Publishing "our reserves are fine" while a
    control says otherwise is the one thing an attestation must not do by
    accident.
- **`core-ledger/cmd/reconcile`** — reconciliation extracted from
  `cmd/server`'s `go ...RunForever()` into its own binary, run as a k8s
  CronJob with `concurrencyPolicy: Forbid`. Exit codes are the contract:
  `0` balanced, `2` broken, `1` could-not-check. A CronJob whose pod always
  exits 0 tells an operator nothing.
- **Reconciliation is now a record, not a log line.** Migration `00006` adds
  `reconciliation_runs` (an observation: every leg, every input, one
  timestamp) and `reconciliation_breaks` (a condition with a *lifetime* —
  the same shortfall on twelve runs is one row with twelve observations, which
  is what makes "how long were we out of balance" answerable and the open list
  a queue somebody can finish).
  - Per-leg verdicts are **three-valued**. `NULL` means the leg was not
    evaluated, which is not the same as passing, and must never render green.
  - Breaks **auto-resolve** when a run no longer observes them, recording the
    run that closed them.
- **The writers the three snapshot tables never had.**
  `POST /reserves/chain-supply-snapshots` (indexer) and
  `POST /reserves/custodian-snapshots` (rms), plus a `GET /reserves/status`
  read surface and the run/break history. They go through the ledger's API
  rather than writing its tables because a second process with INSERT rights on
  a reconciliation input is a second place the peg can be lied to from.
- **`alert()` emits a metric and an event, not a webhook call.** Paging happens
  from the metric (`infra/observability/prometheus/alerts.yml`) because
  Prometheus already owns deduplication, grouping and silencing — and because
  a control that catches an unbacked mint must not depend on Slack being up.
  The event goes through the transactional outbox, so delivery is durable
  rather than a best-effort HTTP call from a pod that is about to exit.
- **NATS JetStream**, turning P2's `Publisher` seam from an HTTP POST into a
  JetStream publish with no domain code changed. The event type was already the
  subject: `damp.<domain>.<event>.v1` was chosen in P2 for this moment.
  `outbox.Choose` picks exactly one destination at boot — a relay publishing to
  both would deliver twice to anything bridging between them.
- **Observability stack** behind a compose `obs` profile: Prometheus,
  Pushgateway, Grafana (provisioned with a Reserves & Reconciliation
  dashboard), Loki. The Pushgateway is not decoration — a CronJob pod lives for
  two seconds and can never be scraped, so without it the metric-based paging
  this phase is built around would silently never fire.
- **Seven runbooks** (`docs/runbooks/`), one per alert, each with a
  *what not to do* section. Most of the expensive mistakes available during a
  reserve incident are things a reasonable person would try first: posting a
  manual journal to make GL 1100 match the bank, minting replacement tokens
  after a reorg, resetting a stalled indexer's cursor to the head.
- `reserves:read` / `reserves:manage` permissions (26 total now).
  `reserves:manage` is deliberately **excluded from `admin`**, joining
  `ledger:admin` and the compliance pair: it can arm a custodian drift and edit
  reserve targets, which between them can make a break appear or disappear, and
  whoever runs the platform must not also be able to change what the control
  watching it reports.
- `platform.Metrics.Register` — the registry was private by design, which was
  right and also meant a service with domain metrics had no way to publish them
  without reaching for the global registerer.

### Changed

- **The saga no longer polls a chain for finality** when `INDEXER_URL` is set.
  All three call sites route through one `awaitFinality`, which is what made
  swapping the mechanism a two-line change rather than three subtly different
  ones. The chain poll stays as the fallback for anything the indexer cannot
  answer — an indexer outage must cost latency, not minting.
- **`cmd/server` no longer runs reconciliation.** The ticker had no context,
  no way to stop, and ran once per replica; scaling the API up tripled the
  reconciliation load for no extra assurance.
- `trust_bank_snapshot` is keyed on `(custodian_id, currency, as_of)` rather
  than `as_of` alone. The old key silently assumed one custodian holding one
  currency forever — a second would have overwritten the first at the same
  timestamp and Leg C would have compared against whichever landed last.
  `CustodianBalance` sums **each custodian's latest**, so a custodian that
  reports hourly cannot mask one that has gone silent, and the returned
  `as_of` is the *oldest* contributor: a total is only as fresh as its stalest
  part.
- `RECONCILE_SNAPSHOT_MAX_AGE` guards against an indexer that has silently
  stopped. A frozen snapshot is perfectly well-formed and increasingly wrong,
  and a reconciliation that keeps passing against it is worse than one that
  fails — it is actively reassuring.

### Notes

- **Not verified live.** Everything here is verified against real Postgres, in
  unit tests, and by `docker compose config` — nothing in this session touched
  Sepolia, devnet, or a real custodian. The phase's DoD (force a drift, see the
  alert in Slack in <60s; `evm_revert` an anvil chain and watch the indexer
  orphan the block) needs credentials and gas.
- The `reserve_targets` / `fee_schedules` tables are written and read but
  nothing consumes fee schedules yet — core-ledger still takes `FEE_*_BPS` from
  config. The table is the versioned audit record the plan listed below the
  risk register's line; wiring it as the *source* is P4 work.

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
