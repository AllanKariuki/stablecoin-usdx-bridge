# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## 2026-09-29 — P6: key custody & contracts v2

Branch `feat/p6-signer-custody`. The phase's goal: *no private key material in
any process env or on any disk; a compliance officer clicks Pause and Sepolia
transfers halt within a block; rotate a relayer key with no service restart.*

### Added

- **`services/signer`** — the only process that can authorise a chain
  transaction. core-ledger stops holding `ETH_RELAYER_PRIVATE_KEY` and asks a
  service that holds it in Vault, over mutually-authenticated TLS.
  - **The value is in what it refuses.** A key in Vault that signs whatever it
    is handed has moved the risk, not removed it. The policy engine is pure
    functions over a decoded request — no database, no clock, no network —
    because a policy engine testable only by standing up a service is one
    whose edge cases are untested, and its edge cases are the point. 17 tests
    at those edges: default-deny for an unruled method, `>=` at the ceiling
    boundary, case-insensitive address allowlists, first-match-wins ordering,
    and a daily limit that catches what a per-signature ceiling cannot.
  - **Policy is a mounted file, not an API.** An endpoint that could edit it
    would give anyone who compromised the service a way to raise its own
    ceilings before using them.
  - **Idempotent on `(chain, method, correlation_id)`.** Without it a saga
    retry after a timeout produces a *second valid signature for the same
    movement* — the chain's replay guard stops the second transaction landing,
    but the platform has authorised the same money twice and which signature
    is real is unanswerable. A denial does not consume the slot; the same
    correlation with a different digest is refused outright.
  - **The audit log is append-only and hash-chained**, enforced by a database
    trigger rather than by code being careful, and **verified at boot** — a
    break discovered later cannot be dated, because every row after it is
    equally suspect. Denials are recorded as carefully as approvals: a burst
    of refusals is the first sign of a compromised caller probing, and a log
    of successes only would show that as silence.
  - Three backends. `local` **refuses to start unless `ENV=local`**. `vault`
    signs ed25519 in Transit (the Solana key never leaves) and reads the
    secp256k1 key from KV — a real weakness, stated as one, and the reason it
    is labelled staging. `fireblocks` returns a *distinct* error rather than a
    plausible one, because it signs asynchronously and pretending that fits a
    synchronous method would hide the mismatch until somebody used it.
  - There is no `Export` on `Backend`. Not an omission: a backend that can
    export is a backend whose keys can leave.
  - Its own namespace, with **egress** restricted as well as ingress — a
    signer that could reach the internet is a signer that could exfiltrate
    what it holds. Prometheus is deliberately *not* allowed in: a certificate
    issued for scraping is a certificate that can also `POST /sign`.
- **Solana `BridgeConfig` PDA** — `initialize_config`, `set_relayer`,
  `set_admin`, `set_paused`. This is R6's fix: the relayer was a compile-time
  constant, so rotating a suspected key meant rebuilding and redeploying the
  program, with a governance window during which the compromised key still
  worked. It is now one transaction. 9 new litesvm tests (19 total), including
  the half that matters after a leak — the rotated-*out* relayer must stop
  working, not just the rotated-in one start.
  - `paused` closes a gap Ethereum never had: Solana's only answer to a
    compromise was revoking the mint authority, which is irreversible and
    takes the honest users with it.
- **`USDXV2`** — resolves the `bridgeBurn` asymmetry. V1 burns any holder
  unconditionally under `BRIDGE_ROLE`; Solana's has always been bounded by a
  delegation the owner granted. The difference matters most in the case nobody
  plans for: a leaked relayer key on Ethereum can burn *every* holder's
  balance, including self-custodied holders who never touched the bridge.
  V2 bounds it to an ERC-20 allowance.
  - **The flag defaults OFF on upgrade.** Turning it on atomically would
    strand every in-flight bridge: a burn whose journal leg was posted under
    V1's rules would revert for want of an allowance nobody was asked for.
  - Custody addresses are exemptible, because requiring the platform's own
    pooled account to keep an allowance topped up adds a failure mode —
    allowance exhausted mid-redemption — to the path that must not have one.
  - 14 new Foundry tests (35 total), including the two that matter about the
    override: the replay guard is re-implemented rather than inherited, and a
    *refused* burn must leave the correlation id usable or a saga would be
    permanently stuck on an id the contract considers spent.
- `platform.RunWith` — `Run` with a caller-supplied listen call, so the signer
  can serve mutual TLS without putting a security-critical TLS branch inside a
  helper every service imports.

### Changed

- **The P2 `Signer` seam is finally used, and cost nothing** — exactly as
  predicted. `bridge.ChainClient` does not change, the saga does not change,
  and `bind.TransactOpts.Signer` was already the right hook. Solana was the
  fiddlier swap and the reason the seam was opened two phases early:
  `tx.Sign`'s callback must return the private key *by value*, which a remote
  signer cannot satisfy at all.
- Signers can now carry what they are authorising, via an optional
  `ContextualSigner`. The client hands over a **copy** bound to one call's
  values rather than setting a field — the worker runs several sagas
  concurrently against one client, and a shared mutable field would race, with
  the failure mode being a signature authorised against another transfer's
  amount.
- `ETH_RELAYER_PRIVATE_KEY` and `SOLANA_RELAYER_KEYPAIR_PATH` are no longer
  `required`, with validation that exactly one of key-or-signer is configured
  — so a deployment with neither fails at boot with a readable message rather
  than at the first mint, hours later, inside the saga.

### Notes

- **Not verified live.** 25 signer tests (8 against real Postgres), 19 Anchor
  tests, 35 Foundry tests, and the full Go suite under `-race`. Nothing has
  talked to a real Vault, a real Fireblocks, or Sepolia. The `USDXV2` upgrade
  has not been performed on the live proxy, and the Solana program has not
  been redeployed — `initialize_config` must be called once after a deploy,
  before any mint, or every `bridge_mint` fails on a missing config account.
- **Transport deviates from the plan**, deliberately: HTTP/2 + mTLS rather
  than gRPC + mTLS, for one Go-to-Go caller over four methods. Same security
  properties, no protoc toolchain. See `services/signer/README.md`.
- Vault's secp256k1 path reads the key into the signer's memory, because
  Transit cannot produce the recoverable `[R‖S‖V]` form Ethereum needs. It is
  a genuine weakness of the staging backend and the reason Fireblocks is the
  production answer.
- The plan's *"move `DEFAULT_ADMIN_ROLE` to a Gnosis Safe"* is an operational
  step on a live contract, not a code change, and has not been performed.

## 2026-09-29 — P5: onboarding, KYC & compliance

Branch `feat/p5-kyc-compliance`. The phase's goal from `docs/building-plan.md`:
*a stranger signs up, submits KYC, is auto-screened, reviewed and approved —
and only then can deposit. A sanctioned counterparty is blocked at transfer
time with a readable reason and a case.*

### Added

- **`services/workflow`** — maker-checker, once. The plan puts it first
  because approval is needed in five places and *"implementing it five times
  gives five definitions of approved"*.
  - **The service executes nothing.** It stores a SHA-256 digest of what was
    proposed and hands it back on approval; the caller re-computes that digest
    over its own object and refuses to act if it differs. So a compromised
    workflow service **cannot authorize anything** — it can return "approved"
    for whatever it likes, and the caller will find no matching object.
    Approval is a statement about a specific payload, not about a request id.
  - The canonical encoding is tested from both directions: stability (key
    order, absent vs `undefined`, repeated calls) and sensitivity (amount
    changed, destination swapped, `"250"` vs `250`). Callers *reimplement* it
    rather than asking workflow for the digest they verify against — asking
    would let a compromised workflow choose it — and
    `services/kyc/test/digest-agreement.spec.ts` imports both implementations
    and asserts they agree, so a drift is a red build rather than the day
    nothing can be approved any more.
  - `exclude_initiator` defaults TRUE and is TRUE on all ten seeded policies.
    One decision per person is a database constraint, not a UI convention: a
    two-of-two policy one person could satisfy by clicking twice is a
    one-of-one policy with extra steps.
  - An action with **no policy is refused**, not waved through — otherwise
    forgetting to write a policy is the same as deciding none was required.
  - `approvals:policies:manage` is held by **no role**, including `admin`.
    Editing a policy changes how many people must agree to a payout; a role
    that held it could weaken maker-checker and then use it.
- **`services/kyc`** — cases, documents, tiers, limits.
  - **A CLEAR screen does not auto-approve.** It skips the human queue but
    still passes through maker-checker: "clear" is a provider's opinion,
    approval grants a tier that can move money, and a provider
    misconfiguration would otherwise silently onboard everyone.
  - **`PENDING_APPROVAL` is not `APPROVED`.** The tier is granted only when
    workflow's decision returns *and its digest still matches the case*.
  - **TIER_0 can do nothing**, which is what makes the DoD's "only then can
    deposit" true by construction rather than by every caller remembering to
    check. Gating reuses core-ledger's `POST /wallets/:id/status` and its
    `ACCOUNT_FROZEN` 409 rather than inventing a second gate — and unfreezing
    never thaws a wallet a *compliance* hold put on.
  - `StubKyc` is **deterministic by email domain**, as the plan asks by name.
    A random stub makes a demo that cannot be rehearsed and a rejection path
    no test can arrange for.
  - **Documents never pass through the service.** The browser PUTs straight to
    object storage on a presigned URL, so passport scans stay out of this
    process's memory, logs and traces — a compromise leaks references, not
    files.
- **`services/compliance`** — screening, rules, alerts, cases, SAR export,
  enforcement.
  - **Consumes `damp.ledger.transaction_posted.v1`**, written inside the same
    `SERIALIZABLE` transaction as the journal lines, so there is no window in
    which money moved and compliance was not told. That is the property the
    outbox was built for in P2, a phase before anything consumed it.
  - **The rules engine is pure functions** over a movement and a window of
    history — no database, no clock, no network. A rule that decides whether
    money may move has to be testable against a fabricated history; one that
    needs a populated Postgres and a mocked clock gets tested once, at the
    wrong values. 21 cases at the boundaries: `AMOUNT_THRESHOLD` fires *at*
    the threshold (treating $10,000 as "over ten thousand" makes
    exactly-at-the-limit the safe amount to send), `VELOCITY` counts the
    movement being evaluated, `AGGREGATE_WINDOW` sums scaled integers,
    `STRUCTURING` catches the pattern thresholds themselves create, and
    `NEW_PARTY_LARGE_TX` treats a null first-seen as *new* rather than
    exempting the very transaction it exists for.
  - **No seeded rule ships as BLOCK.** A rule that can freeze a customer's
    money on the day it is deployed has never been observed against real
    traffic, and the false-positive rate of an unobserved rule is unknown by
    definition.
  - One case per party, not per alert; severity only rises; case notes are
    append-only; a SAR **requires a narrative**, stored verbatim, because the
    narrative is the report and regenerating it would produce a different
    document each export.
  - **Enforcement stops short, visibly.** Wallet freezes execute (no key
    needed). Blacklist and pause are approved and then sit `APPROVED` with an
    explicit reason, because submitting them needs a key holding
    `COMPLIANCE_ROLE`/`PAUSER_ROLE` and custody is P6 — incomplete on purpose
    rather than marked `EXECUTED` on the strength of nothing having happened.
- `approvals:propose` / `approvals:decide` / `approvals:policies:manage`
  (31 permissions). `auditor` holds propose and **not** decide: independent
  oversight that can approve is not independent.
- MinIO in compose, three service databases, k8s manifests with
  NetworkPolicies, Prometheus targets, and bff forward routes listed
  explicitly — a wildcard would have quietly exposed
  `/internal/approvals/callback` through the gateway.

### Notes

- **Not verified live.** 125 tests pass across nine packages (56 of them new
  in this phase: 15 digest, 20 kyc, 21 compliance rules). No service in this
  phase has been run against a real database, a real screening vendor, or
  MinIO.
- The seeded policies are a starting position, not a compliance opinion. Who
  may approve what, and how many of them, is a decision for whoever runs the
  platform.

## 2026-09-28 — P4: money in and out

Branch `feat/p4-payments-notifications`. The phase's goal from
`docs/building-plan.md`: *a customer links a bank account, deposits fiat,
converts KES→USD, issues USD-X, and gets an email and an in-app notification
at each step; a company issues an invoice and the customer pays it.*

### Added

- **`services/payments`** (NestJS) — payment intents, invoices, payment links,
  beneficiaries, bank accounts and rails. It owns **no balance**: every intent
  that settles posts one journal transaction through core-ledger, and the
  entity back-reference comes free because `Deposit`/`Withdraw` already stamp
  `entity_type = BANK_PAYMENT` with the caller's reference.
  - **Settlement order is load-bearing:** the rail confirms, *then* the ledger
    posts, *then* the intent is marked. Marking first would let a crash leave a
    payment saying SETTLED with no journal entry behind it — a balance that
    exists in a dashboard and nowhere else.
  - **4xx and 5xx are not the same answer.** A 4xx is the ledger saying this
    movement is not allowed and never will be, so the intent fails. A 5xx or a
    network error is *"we don't know"*, and the intent is deliberately **not**
    failed — the rail has already moved the money, and marking FAILED on a
    don't-know is a lie about somebody's bank account. It re-throws instead, so
    the rail retries, and `payments:<intent id>` makes the retry safe.
  - **`StubRail` settles through its own callback, not inline.** A stub
    returning `{status: 'SETTLED'}` from `collect()` would leave the settlement
    path — the code that decides money moved — untested until the day a real
    rail was plugged in. It also fails on demand (an amount ending in `.13`),
    because a payments service whose demo data always succeeds has a failure
    path nobody has ever run.
  - **M-Pesa via Daraja sandbox** (STK Push to collect, B2C to disburse), for
    the plan's stated reason: free and self-service. Unconfigured is a normal
    state — `RailRegistry` falls back to the stub and logs it, rather than
    500-ing routes the frontend already calls. Daraja's two incompatible
    callback shapes are parsed behind one method so none of that mess reaches
    settlement. An amount with cents is **refused** rather than sent: Daraja
    truncates silently, which would settle a different amount than the intent
    records.
  - **Only the last four digits of an account number are stored.** Once the
    rail has its opaque handle, the number is a credential for a customer's
    bank relationship and nothing more.
  - Invoices carry an unguessable `pay_token`; voiding clears it, which makes
    voiding a revocation rather than a label.
- **`services/notifications`** (NestJS) on **:3000 with `/ws`** — the port and
  path `frontend/public/runtime-config.js` has declared since before this
  service existed. Templates, preferences, a delivery log, and HMAC-signed
  outbound webhooks.
  - **The delivery row is written before anything is sent.** A notification
    sent but not recorded is one nobody can prove happened. In a dispute,
    *"did they know"* is a different question from *"did it happen"*, and this
    table is the only answer to the first.
  - **Consumes core-ledger's transactional outbox** at `/internal/outbox`,
    which is where reconciliation's break alerts land. P3 gave `alert()` a
    metric and an event instead of a `log.Printf`; this is the thing on the
    other end, and the last link in making R7 untrue.
  - **The socket is a fan-out, not an API** — the only inbound message
    accepted is a ping. A client that could *act* over the WebSocket would be
    acting over a channel that bypasses the gateway's route table, where every
    permission check this platform has lives.
  - WebSocket auth happens in this service rather than at Traefik because a
    browser cannot set headers on `new WebSocket()`. It is the one place
    outside auth-proxy that verifies a JWT, and it establishes *who* is
    connecting and nothing else.
  - Webhook signatures sign the timestamp **with** the body, so a captured
    request cannot be replayed. The secret is returned once: one that can be
    re-read from an API proves nothing.
- **bff upstream proxy** — route shapes listed explicitly rather than a
  wildcard, so the set of publicly reachable paths is readable in one file and
  matches auth-proxy's rules one for one. A blanket `@All('*')` would make a
  new upstream endpoint publicly reachable the moment it was written.
- `notifications:read:own` / `notifications:webhooks:manage` (28 permissions),
  Mailpit in the `obs` profile, and both services in compose, k8s and
  Prometheus.

### Changed — the frontend stops inventing data

Three slices were structured so that **a failed request wrote mock data into
state as though it had come from the server**. The screens looked fully
working and were not wired to anything.

- **`bankAccountsSlice`** — every one of its seven thunks caught its own error
  and `rejectWithValue`'d a `MOCK_*` blob. Rewritten against the real
  `/banks/*` routes with no fallback. The two-section "my accounts" / "linked
  accounts" UI became one list, because registered and verified are *statuses
  of one account*, not two kinds of object — showing both made an account
  appear twice the moment it was verified.
- **`conversionClient`** — `const USE_MOCK = 'true'`, a non-empty string and so
  unconditionally truthy, with the env-driven line commented out directly
  above it. Every FX quote and conversion was invented. It now reads
  `VITE_USE_MOCK_API`, posts to `/fx/quotes` and `/fx/conversions` (the routes
  core-ledger has always served; the bare `/quotes` it used to post to has
  never existed), and uses the app's shared axios instance — the old one built
  its own client against a default that now points at the notifications
  WebSocket, carrying a bearer token from a `localStorage` key nothing has
  ever written.
- **`unifiedNotificationsSlice`** — `GET /notifications/unified` (never
  served), catching the 404 and returning three hardcoded notices. Now reads
  services/notifications, and receives live pushes over the WebSocket.
- **The aviation lineage finally leaves.** The notification system was built
  around NOTAMs — *Notice to Air Missions*, with altitude bands, a
  start/end schedule and a `/dispatch/notam-alerts/:id` route — from the app
  this frontend was forked from, the same lineage P0 purged Cesium, three.js
  and the flight/crew chart components from. Replaced with the four event
  families this platform actually emits: payment, ledger, reserves, system.
- **Removed `@types/axios`** — a 2016 DefinitelyTyped stub for axios 0.9 that
  declares a global `Axios` namespace and shadowed the types axios has shipped
  in-package since 0.14. Every `AxiosInstance` in the app was resolving to it.

### Notes

- **Not verified live.** 69 Node tests pass (11 of them on the settlement path
  specifically), the frontend builds and its 13 tests pass, `docker compose
  config` validates. Nothing here has talked to Daraja, a real bank, or an SMTP
  server that isn't Mailpit.
- The frontend's pre-existing `tsc` debt is unchanged at ~145 errors, none of
  them in a file this phase touched (see the P1 note: the portal was forked
  from an unrelated multi-asset template and carries trading/investments/
  insurance/loans pages that aren't planned services at all). `vite build`
  succeeds, as it did before.
- `conversionClient`'s mock methods still don't type-check. They are the
  documented `VITE_USE_MOCK_API` escape hatch and were already broken; deleting
  ~300 lines of them was more scope than rewiring the client warranted.
- WebSocket fan-out is per-process, so with more than one notifications replica
  a customer connected to A misses a push produced on B. Tolerable rather than
  ignored: the socket is not the durable path — every notification is written
  to `deliveries` first and re-fetched on reconnect — so it costs latency, not
  information. The exact fix is a shared pub/sub, and NATS has been in the
  cluster since P3.

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
