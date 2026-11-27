# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## 2026-11-27 — Portal: deposit and withdraw wizards (slice 5c)

### Added — step-by-step deposit and withdraw in the portal

- `/move/deposit` is a four-step wizard: method (M-Pesa or bank transfer),
  details, confirm, status.
  - Details: the destination wallet (only currencies the method supports,
    with an inline "Add <CCY> wallet"), the amount, and either the M-Pesa
    number or the bank account to pull from.
  - Status: polls the intent through "approve the prompt on your phone",
    processing, then credited or failed (friendly reasons, with a retry).
- `/move/withdraw` is a five-step wizard: from (fiat wallets only), method,
  amount (checked exactly against the available balance), confirm, status.
  - Confirmation requires retyping the amount. There is no PIN backend, so
    retyping is the deliberate-act check the damp-ui design's security step
    stands for.
- Both wizards send `sourceWalletId`, so the user chooses which wallet
  moves, and use a one-time Idempotency-Key per confirm.
- New shared pieces: `Stepper` (the send wizard uses it too),
  `MethodPicker`, `WalletRadio`, `IntentStatus` and `MoveNav`. Added
  `compareDecimal` to the shared money helpers, plus friendly copy for
  `MPESA_KES_ONLY` and `RAIL_UNAVAILABLE`. `/move/transfer` is unchanged
  apart from the shared tabs.

### Added — banks & mobile money, profile menu, help

- `/payments/banks` is now "Banks & mobile money", with three tabs:
  - **My bank accounts.**
  - **Mobile money:** M-Pesa numbers, told apart by the institution's rail
    rather than a separate table. Adding one validates a Safaricom number
    and registers it against the M-Pesa institution.
  - **Available institutions:** each one is labelled "Bank transfer" or
    "Mobile money".
- A top-bar profile dropdown (`ProfileMenu`): who is signed in, Settings,
  Verification, Help and Sign out. It closes on Escape or an outside click.
- `/help`: searchable FAQs for wallets, converting, sending, deposits and
  withdrawals, USD-X, and security. The answers describe only behaviour the
  backend enforces. It is in the Account nav.

### Fixed — M-Pesa payments never reached the M-Pesa rail

- `services/payments`: an intent naming only a phone number used to fall
  through to the `stub` rail. So did a MOBILE beneficiary, because the
  beneficiary branch never looked up its institution's rail. Wherever the
  stub was enabled, an "M-Pesa" deposit could book ledger credit for
  shillings that never arrived.
  - A bare phone number now routes to `mpesa` and must be KES
    (`422 MPESA_KES_ONLY`).
  - BANK and MOBILE beneficiaries use their institution's rail.
  - Where Daraja isn't configured, the registry refuses with
    `RAIL_UNAVAILABLE`. New spec: `intents-rail-routing.spec.ts`.

## 2026-11-27 — Portal: convert page with history, and USD-X chain moves (slice 5b)

### Added — Convert page (frontend/portal)

- `/convert` is now a full two-column screen: the existing `SwapCard` stays on
  the left (keeping its `?from=` / `?to=` deep links), with a "How conversion
  works" explainer beside it — live multi-source pricing, ~30s quotes that
  re-quote automatically, spread as the only fee, 1:1 USD↔USD-X, and the
  two-step route other USD-X pairs take via dollars.
- Below both, a "Conversion history" table lists every swap and USD-X
  issue/redeem (from `GET /conversions`), newest first, with cursor "Load
  more" pagination; columns show date, from → to (with currency icons),
  amount out, amount in, rate and status. Rows open the existing
  `TransactionDrawer`. Loading, empty and error-with-retry states are handled.

### Added — Move between chains (frontend/portal)

- The USD-X page gains a "Move between chains" card: pick one of the caller's
  USD-X wallets (ETHEREUM/SOLANA), enter an amount, and the destination is the
  other chain. When that chain has no wallet yet, an inline "Open a USD-X
  wallet on <chain>" step (via `OpenUsdxWalletForm`, chain pre-selected and
  locked) runs first.
- Submitting posts `POST /bridges` with an Idempotency-Key minted once per
  confirm, then follows the saga through `GET /transfers/:correlationId` to a
  terminal state on the existing `SagaTimeline`. Friendly errors throughout.

### Changed — Portal and bff

- Conversion history shows the booked FX rate: bff maps only `metadata.rate` /
  `metadata.spread_bps` into a `fx` field (never the rest of metadata, so
  `payee_user_id` stays internal), and the bridge saga timeline now uses
  bridge-specific steps naming the source and destination chains.

## 2026-11-27 — Portal: pay invoices from any wallet (slice 5b)

### Changed — Invoice pay (frontend/portal)

- The public payment link (`/pay/:token`) and the in-app "To pay" invoice list
  both replace the fixed-wallet pay with the shared `PayFromPicker`, so a
  payer can fund an invoice from any wallet they hold:
  - Same-currency source pays straight out (`sourceWalletId` only).
  - Cross-currency source asks for a TO-side live quote minted for the fixed
    invoice amount — the picker shows you-pay / rate / fee / recipient-gets
    with a countdown and auto re-quote — and submits `quoteId` +
    `sourceAmount` (= the pinned quote amount) with the pay.
  - A USD-X source into USD rides the 1:1 redemption with no quote, notes it
    settles after the burn confirms, and the result shows `ConvertingTracker`
    polling the CONVERTING intent to settlement.
  - Idempotency-Key is minted once on confirm and reused on retries; errors
    surface through the shared friendly-code map.
- The public link keeps its anonymous resolve-and-sign-in flow untouched;
  wallets only load for a signed-in payer.

## 2026-11-27 — Portal: send money from any wallet (slice 5b)

### Added — Send wizard (frontend/portal)

- New `/send` page — a four-step wizard (Recipient → Amount → Review → Result),
  reached from a new "Send" nav item under Move money (`payments:write:own`):
  - Recipient: on-platform payees, verified bank accounts and saved bank
    beneficiaries, or M-Pesa beneficiaries, each on its own tab; a payee
    deep-linked from Quick Send (`/send?payee=<id>`) skips straight to the
    amount, and a payee can be added mid-send.
  - Amount + "Pay from": pick any wallet. A cross-currency source asks for a
    TO-side live quote (the recipient still nets the exact amount) and sends
    `quoteId`/`sourceAmount` with the intent; a same-currency source sends
    only `sourceWalletId`; a USD-X source into USD rides the 1:1 redemption
    with no quote. A rail payout (bank/M-Pesa) can only be funded from a
    wallet holding that currency — other wallets are greyed with a
    "Convert first" link to `/convert?to=<CCY>`.
  - Review shows the legs, fee and recipient amount, then `createIntent`.
  - Result: a receipt for settled intents, or a `ConvertingTracker` that
    polls the CONVERTING intent to SETTLED/FAILED/CANCELLED.
- Shared pieces extracted so the invoice pay path reuses them: `useQuote`
  (the debounced quote + countdown, moved out of SwapCard), `PayFromPicker`,
  `ConvertingTracker` and `AddPayeeModal`.
- Friendly error codes for the send rails added to `client.ts`
  (`QUOTE_REQUIRED`, `SOURCE_AMOUNT_REQUIRED`,
  `CROSS_CURRENCY_RAIL_UNSUPPORTED`, `QUOTE_ALREADY_USED`,
  `QUOTE_AMOUNT_MISMATCH`, `QUOTE_EXPIRED_DURING_CONVERSION`).

## 2026-11-27 — Portal: multi-asset dashboard and wallets (slice 5a)

### Added — Home dashboard (frontend/portal)

- The Home page is rebuilt as a 12-column (stacked on mobile) multi-asset
  dashboard on the real APIs — no mock data:
  - Header: greeting, total portfolio value in USD (every wallet's balance
    × its USD rate; USD-X = 1:1) with a localStorage-persisted eye toggle;
    wallets whose rate is unavailable show "—" and a "some prices
    unavailable" note. All sums are BigInt-exact (new `addDecimal` /
    `mulDecimal` / `divDecimal` helpers in `@damp/web-shared/api/money` —
    money never passes through a float).
  - "Markets": a recharts multi-series line chart of BTC/ETH/SOL percent
    change from `GET /rates/history` (1H–ALL tabs, default 1M), one percent
    y-axis, fixed per-asset colours (BTC `#D97706`, ETH `#6D4ED8`, SOL
    `#0E9F8E`), crosshair tooltip with % + price, legend plus labels at the
    line ends, per-asset price/24h-change rows below, and an accessible
    "View as table" toggle.
  - Hero banner ("Pay with anything."), Quick send (saved payees as
    deterministic avatar circles linking to `/send?payee=<id>`), and a Swap
    card: debounced 500ms quotes (`amount_side FROM`), fee/total/net
    display, a live countdown to `expires_at` that re-quotes at zero,
    ISSUANCE/REDEMPTION peg handling, friendly messages for
    `USDX_TWO_STEP` / `USDX_USES_ISSUANCE` / `EXPOSURE_LIMIT_EXCEEDED` /
    `PARTY_OUTSTANDING_CAP_EXCEEDED` / `PAIR_TRIPPED` / `STALE_PRICE`, an
    inline "Add \<CCY> wallet" before quoting when the target wallet is
    missing, and Convert with a per-quote Idempotency-Key.
  - "My portfolio" (rows per wallet with icon, 24h change and default
    star) and "Recent activity" (last 6 transactions).

### Added — Wallets (frontend/portal)

- Wallets page groups Fiat / Crypto / USD-X, each wallet a card with
  currency icon, label, balance (respects the hide toggle), USD value,
  status badge and default star, plus an actions menu (Set as default via
  `updateWallet` — only when a currency has more than one wallet — Rename
  with the 64-character cap, View statement).
- Add-wallet wizard: type → currency (from `GET /currencies`, excluding
  held currencies; USD-X reuses the chain-picking `OpenUsdxWalletForm`
  flow) → optional label + confirm → success with "Fund it"
  (`/move/deposit`) or "Buy \<CCY>" (`/convert?to=<CCY>`) CTA.
- Wallet detail shows the default flag, gains a Rename action and a
  Convert action (`/convert?from=<id>`).
- New `/convert` page (nav item under Move money, `fx:convert`) reusing
  the Swap card full-width, pre-seeded from `?from=` / `?to=` deep links.
- New `toast`/`Toasts` in `@damp/web-shared/ui`; a `ResizeObserver` stub
  in the portal test setup keeps recharts renderable under jsdom.

## 2026-11-27 — Portal money API: wallets, quotes, conversions and price history (slices 4b/4c)

### Added — price history (services/pricing, slice 4c)

- New migration `003_price_points.sql`: one row per (symbol, 1-minute
  bucket) holding the aggregated mid and its sources. The aggregator
  upserts after every poll — for each crypto USD leg (BTC/ETH/SOL vs USD)
  and each fiat USD leg (USD/EUR, USD/GBP, USD/KES) — but only while the
  symbol is OK: a stale or tripped symbol is deliberately not recorded, so
  the chart can never show a price the quote path refuses (the gap is the
  chart's own TRIPPED marker). A retention job (at boot, then daily) keeps
  minute buckets for 2 days, downsamples older rows to the last point per
  hour, and deletes rows older than 400 days.
- `GET /rates/history?symbols=BTC,ETH&range=1H|1D|1W|1M|1Y|ALL&base=USD`
  (role `pricing.read`): per symbol, points `[{t, price}]` converted into
  `base` through the USD legs at each point's own time (the base leg
  contributes the point whose bucket is closest, ties going to the earlier
  point so a chart never uses lookahead), downsampled to at most 300
  points, plus `change_pct` = (last−first)/first×100 as an exactly-2-dp
  string — computed on fixed-point BigInts, never floats. A fiat base leg
  is fetched in full (a daily point's closest match can predate a short
  window); a crypto leg from the window's start.
- `GET /rates` (the board) gains `change_24h_pct` per entry — the newest
  recorded point against the newest at or before 24h ago, computed on the
  *displayed* rate (a crypto entry's inverted leg) — when history has
  enough points; a database outage degrades the field, never the board.
  Non-USD boards omit it: their cross-rate change needs both legs composed
  per point, which is the history endpoint's job, not the board's.

### Added — the portal money API (core-ledger + bff + auth-proxy)

- core-ledger gains `GET /currencies` (`ledger.user-proxy`): the active
  currencies from the chart with kind, decimals, name and the derived
  `native_chain` (NativeChain — a property of the custody model, not of the
  currency row).
- bff customer routes, every one deriving the caller from the auth context
  (never a body field) and ownership-checking every wallet it names before
  any other service hears about it:
  - `GET /currencies` — core-ledger's chart in camelCase.
  - `POST /wallets {currency, label?}` — any supported currency, stamped
    with the native chain for crypto, idempotent per (user, currency) by
    core-ledger's EnsureWallet; USD-X answers 422 `USE_USDX_ROUTE` (it
    lives on two chains — open it through the existing POST /wallets/usdx).
  - `PATCH /wallets/:walletId {is_default?, label?}` — ownership-checked,
    then core-ledger's PATCH (is_default may only be set true, labels
    capped at 64 runes). Wallet views gain `isDefault`.
  - `POST /quotes {fromWalletId, toWalletId? | toCurrency?, amount,
    amountSide?}` — derives both currencies from the wallets, quotes
    through services/pricing with `party_id` = the caller. The
    USD<->USD-X pair answers a synthetic 1:1 peg preview (`quote_id: null`,
    `rate: "1"`, `fee: "0"`, `route: "ISSUANCE" | "REDEMPTION"` — nothing
    is minted; bff does not know the issuance fee schedule, which lives in
    core-ledger); any other USD-X pair answers 422 `USDX_USES_ISSUANCE`.
    Every response carries `route: "FX" | "ISSUANCE" | "REDEMPTION"`.
  - `POST /conversions {fromWalletId, toWalletId, amount, quoteId?}` —
    KYC-gated exactly like POST /transfers (the caller's tier, before any
    ownership read or core-ledger call), Idempotency-Key mandatory. FX
    books core-ledger's POST /fx/conversions (201); the peg routes reuse
    the issuance/redemption journals with the same shapes, idempotency
    discipline and saga handle (202); other USD-X pairs answer 422
    `USDX_TWO_STEP` ("convert to USD first"). Response: `{route,
    transaction, correlationId, sagaStatus, status}`.
  - `GET /conversions` — the caller's FX_CONVERSION / USDX_ISSUE /
    USDX_REDEEM transactions. core-ledger's `GET /transactions` gains an
    optional repeated or comma-separated `type` filter (validated against
    the known TxType values, 400 on an unknown one), applied in SQL before
    the limit and keyset cursor — so bff passes the three types through and
    returns core-ledger's cursor directly, and a conversion older than a
    page of deposits still pages into view.
  - `GET /rates` and `GET /rates/history` — customer paths proxied to
    services/pricing (svc-bff holds pricing.read), separate from the ops
    console's `/pricing/*` surface.
- `services/auth-proxy` route table (no new permissions): `GET /currencies`
  → wallets:read:own; `POST /wallets`, `PATCH /wallets/:walletId` →
  wallets:write:own/:any; `POST /quotes` → fx:quote; `POST /conversions` →
  fx:convert; `GET /conversions` → transactions:read:own; `GET /rates`,
  `GET /rates/history` → wallets:read:own. POST /bridges was already
  customer-reachable (bridge:create) — unchanged.

### Added — shared frontend API (@damp/web-shared)

- `wallets.ts` (`currencies`, `createWallet`, `updateWallet`), `fx.ts`
  (`quote`, `convert`, `conversions` — typed against bff's exact wire
  shapes including `route`) and `rates.ts` (`rates`, `history`, plus the
  normalizing `historyQuery` helper), exported from the api barrel.
- `payments.ts`: `createIntent` and `payInvoice` accept the cross-asset
  legs `sourceWalletId`/`sourceAmount`/`quoteId` (passed through to
  services/payments untouched — verified by a new bff passthrough e2e), and
  `PaymentIntent` carries them back.

## 2026-11-26 — Pay from any wallet: cross-asset payments (slice 4a)

### Added — TO-side quotes (services/pricing)

- `POST /quotes` accepts optional `amount_side: "FROM" | "TO"` (default
  FROM). A TO-side quote fixes the **net the payee must receive** — the
  shape an invoice payment needs, since the invoice is fixed in the payee's
  currency — and pricing solves for the smallest `from` amount whose
  conversion nets at least that: a ceil-division estimate on net's exact
  linear bound, stepped up over `convertAmount`'s two truncations and then
  minimized by binary search (a linear walk would not terminate practically
  on a wide-scale pair — the ETH→USD gross truncation is flat over ~10^12
  wei at a time). The minted quote is pinned to the solved amount exactly as
  a FROM-side quote is, and the exposure guard sees the same solved notional.
  The response gains `amount_side` and returns both `amount` (the solved
  `from` amount) and `net`. Minimality and net-≥-target are unit-tested
  across BTC 8dp, ETH 18dp and KES 2dp.

### Added — payments from any wallet (services/payments)

- New migration `004_cross_asset_intents.sql`: `payment_intents` gains
  `source_wallet_id`, `source_currency`, `quote_id`, `source_amount`,
  `conversion_ref` (the redemption saga's correlation id) and
  `conversion_next_poll_at` (the poller's lease); the status vocabulary gains
  `CONVERTING`. `currency`/`amount` keep their meaning — what the payee
  receives for a TRANSFER, what moves on the rail otherwise.
- `POST /payment-intents` (and `POST /invoices/:id/pay`, which passes the
  same fields through) accepts optional `sourceWalletId`, `sourceAmount` and
  `quoteId`. The wallet is fetched from core-ledger (`GET /wallets/:id`) and
  must belong to the payer and be ACTIVE; a same-currency wallet simply
  substitutes for the ensured one (so a payer can pick which USD-X wallet,
  ETH or Solana, to pay from). Cross-currency is a TRANSFER to an in-platform
  WALLET beneficiary only — DEPOSIT/WITHDRAWAL rails stay single-currency
  (422 `CROSS_CURRENCY_RAIL_UNSUPPORTED`) — and requires the quote and its
  pinned `source_amount` (422 `QUOTE_REQUIRED` / `SOURCE_AMOUNT_REQUIRED`).
  Settlement books it through core-ledger's `POST /fx/payments` under the
  intent-derived idempotency key; terminal quote refusals
  (`QUOTE_EXPIRED`, `QUOTE_ALREADY_USED`, `QUOTE_AMOUNT_MISMATCH`,
  `QUOTE_PARTY_MISMATCH`, `INSUFFICIENT_FUNDS`) fail the intent with the
  ledger's code.
- **USD-X source is a two-step.** USD-X never converts through FX, so the
  intent is created `CONVERTING` and a redemption posts at creation
  (`POST /redemptions`, idempotency key `payments:<intent>:redeem`) into the
  payer's USD wallet; a `ConversionPoller` (outbox-relay claim shape:
  `FOR UPDATE SKIP LOCKED` lease, every replica can run one) polls
  `GET /transfers/:correlationId` and, once the saga is `COMPLETED`, settles
  the fiat leg — a plain transfer for a USD target (the redemption is 1:1 at
  the default zero redemption fee), an FX payment against the stored USD
  quote otherwise. If the saga fails, the intent fails with the saga's
  reason; the ledger reverses the redemption itself while it is PENDING
  (the USD-X in suspense returns to the payer's wallet). A crash between the
  intent and the redemption is recovered by the poller re-posting under the
  same idempotency key, which resumes the same saga.
- **Known limitation — quotes can expire during the burn.** On-chain
  finality is slower than a quote TTL: if the USD→target quote expires while
  the burn confirms, the intent fails with `QUOTE_EXPIRED_DURING_CONVERSION`
  and the redeemed USD remains in the payer's USD wallet (it is their money;
  it is never spent against an unpinnable rate).
- Invoice pay cross-currency checks the booked net after settlement: the net
  is read from the FX payment's transaction metadata (`metadata.net`, in the
  target currency's smallest units, now rendered by core-ledger's
  `renderTransaction`) and compared to the invoice amount; a shortfall — or a
  response without a well-formed net — is a bug, and it fails loudly — the
  intent stays un-settled for an operator rather than marking an underpaid
  invoice PAID.
- The core-ledger client gains `getWallet`, `payConverted`, `redeem` and
  `getTransfer` (service-token auth, idempotency headers, `LedgerError`
  mapping, 404→null on reads), and `LedgerError` now surfaces the envelope's
  error `code`.

### Changed — core-ledger auth (no flow changes)

- `ledger.settlement` (svc-payments) now also holds `GET /wallets/:walletId`
  (to verify a source wallet's owner/currency/status), `POST /redemptions`
  (to start the USD-X leg) and `GET /transfers/:correlationId` (to poll the
  burn saga). Everything else the role can and cannot touch is unchanged.

## 2026-11-26 — Ops Console: crypto exposure, rebalances and pricing (slice 3b)

### Added — the treasury/exposure and pricing surfaces reach the Ops Console

- `services/auth-proxy` route table now exposes rms's exposure and rebalance
  surface (`GET /exposure`, `GET/PUT /exposure/limits/:currency`,
  `GET/POST /treasury/rebalances`) and pricing's pair policy
  (`GET /pricing/pairs`, `GET /pricing/rates`, `PATCH /pricing/pairs/:base/:quote`).
  Reads sit on `reserves:read`; the writes (set a mandate, post a rebalance,
  tune a pair) on `reserves:manage` — the same segregation as reserve
  targets, so `admin` (which holds `reserves:read` only) cannot change them.
  No new permissions were added.
- `services/bff` forwards both surfaces: the rms routes join
  `RmsProxyController`, and a new `PricingProxyController` maps
  `/pricing/*` → pricing's `/pairs` and `/rates` (stripping the `/pricing`
  prefix), using the same `UpstreamProxy` + svc-bff service-account token
  (svc-bff already holds `pricing.read`/`pricing.admin` and `rms.user-proxy`).
  New `PRICING_URL` config (empty answers 503 like the other proxies),
  wired through `scripts/stack.sh` (`http://localhost:13009`) and bff's
  `.env.example`.
- `@damp/web-shared/api` gains `treasury.ts` (exposure rows, limits,
  rebalances) and `pricing.ts` (pairs, indicative rates) with a new `patch`
  client helper, typed against the exact upstream response shapes.
- Ops Console treasury workspace gains two pages — **Crypto exposure**
  (per-asset liabilities/holdings/net exposure with signed short styling,
  mandate, utilisation bar, custodian MATCH/DRIFT badge, edit-mandate and
  record-rebalance modals, and rebalance history) and **Pricing** (indicative
  rates with OK/STALE/TRIPPED status, pair policy table, pair edit drawer).
  Both are gated on `reserves:read` for the route/nav like Custodians, with
  mutating controls behind `reserves:manage`.

## 2026-11-26 — Treasury and exposure for custodial crypto (slice 3a)

### Added — ledger treasury positions and the rebalance journal (core-ledger)

- `GET /treasury/positions` reports, per active custodial crypto currency
  (BTC/ETH/SOL), the customer liabilities (the `GLWalletParent(C)` subtree
  sum — a new `SubtreeBalance` rollup over the materialized hierarchy),
  custody holdings, FX position and `net_exposure =
  custody_holdings - customer_liabilities` (negative = the house is short)
  as decimal strings. Roles: `ledger.reserves.custodian` (rms),
  `ledger.user-proxy`, `ledger.reports.read`.
- `POST /treasury/rebalances` (idempotent) posts the journal for one
  treasury desk trade, new `TREASURY_REBALANCE` transaction type and
  `TREASURY_REBALANCE` entity type. BUY: DR crypto-at-custodian / CR FX
  position (crypto), DR FX position / CR trust bank (fiat); SELL is the
  exact mirror. The posting engine floors the two real asset accounts
  (trust bank on BUY, custody on SELL) so a trade cannot manufacture a
  negative asset balance. Writes are locked to the new `ledger.treasury`
  role — held by rms alone, mirroring the reserves writers' isolation.

### Added — exposure policy, crypto custodian reconciliation and the treasury desk surface (services/rms)

- New migration (`003_exposure.sql`): `exposure_limits` (max_short/max_long
  per currency, seeded 5 BTC / 100 ETH / 5000 SOL both sides) and
  `treasury_rebalances` (the desk's own record, unique on `ledger_tx_id`).
  The `custodians` table now accepts BTC/ETH/SOL via a check constraint,
  and BTC/ETH/SOL stub custodians are seeded.
- The stub custodian now reports the ledger's own custody holdings (from
  `GET /treasury/positions`) for crypto custodians, plus the same
  configurable drift. Crypto statements stay in rms — they are never
  posted to `/reserves/custodian-snapshots`, which is the USD-X peg leg —
  and reconcile in rms: `GET /exposure` computes a per-currency
  MATCH/DRIFT status (abs diff vs `CRYPTO_RECON_TOLERANCE`, default 0),
  alongside positions, limits, utilisation in bps and the latest custodian
  snapshot.
- `POST /exposure/check` (role `rms.exposure.check`, held by svc-pricing)
  takes the signed change in customer liabilities a quote would cause and
  refuses with `422 EXPOSURE_LIMIT_EXCEEDED` if the projected position
  breaches -max_short or +max_long. It fails closed: a currency with no
  `exposure_limits` row is refused with `422 NO_EXPOSURE_POLICY` rather
  than quoted unbounded — treasury must set a mandate before that currency
  can be quoted.
- Known limitation: the check compares against the ledger's *booked*
  positions, so quotes issued but not yet consumed are not counted. The
  gap is bounded by quote TTL and pricing's per-party outstanding cap, not
  by this check.
- `GET/PUT /exposure/limits/:currency` (audited via the audit relay) and
  `POST /treasury/rebalances` — validates the trade, calls core-ledger
  under a deterministic Idempotency-Key derived from the trade content (so
  retries replay, never double-trade), records it and audits it in one
  transaction; replays return the existing row without double-auditing.
  `GET /treasury/rebalances` lists.

### Added — the rms exposure gate in the quote flow (services/pricing)

- `RmsExposureGuard` replaces the slice-3 placeholder: before the local
  reservation, every crypto-legged quote asks rms `POST /exposure/check`
  with svc-pricing's own token (rms audience via a new
  `aud-mapper-rms`). If `to` is custodial crypto, delta = +gross units of
  `to`; if `from` is custodial crypto, delta = -amount of `from`; fiat legs
  are not checked. rms refusal → `422 EXPOSURE_LIMIT_EXCEEDED`;
  unreachable → `503 RMS_UNAVAILABLE`, fail closed. The guard composes with
  `DbExposureGuard` under the existing `EXPOSURE_GUARD` token, so the
  quotes flow needed no changes.
- `RMS_URL` config wired through pricing's config class, `.env.example`,
  `scripts/stack.sh` (http://localhost:13005) and the k8s deployment
  (rms.default.svc.cluster.local:3005).

### Changed — Keycloak realm template

- core-ledger client: new `ledger.treasury` role, granted to svc-rms
  (scope mapping + service account) beside `ledger.reserves.custodian`.
- rms client: new `rms.exposure.check` role, granted to svc-pricing; and
  svc-pricing's tokens now carry the rms audience via `aud-mapper-rms`.

## 2026-11-26 — services/pricing: the only issuer of FX quotes

### Added — a pricing service that owns every rate the platform quotes

- `services/pricing` (NestJS, modeled on services/rms): prices
  USD/EUR/GBP/KES/BTC/ETH/SOL from Coinbase + Kraken tickers and an
  er-api-shaped fiat feed (or a fixed-rate stub for local/e2e), all in
  BigInt fixed-point arithmetic at the ledger's 18-decimal rate scale.
- Aggregation policy: crypto symbols need two fresh sources (median), fiat
  one; a deviation circuit breaker trips a symbol when any two sources
  disagree by more than 150bps and refuses to quote until they agree again;
  cross rates are computed through USD, with inverted legs truncating
  toward the house.
- `POST /quotes` mints single-use quotes pinned to one amount and one party
  in core-ledger via `POST /fx/quotes` under `ledger.pricing`, after an
  exposure guard enforces the pair's `max_notional_usd` and a per-party cap
  on *outstanding* (unexpired) quoted notional, so abandoned re-quotes don't
  use up a user's allowance. The guard reserves first: a per-party advisory
  lock, the cap check and a `RESERVED` row commit together before the ledger
  call, and the row then becomes `ISSUED`, or is deleted if the ledger fails.
  Concurrent requests therefore can't overshoot the cap. Daily and tier spend
  limits stay with bff and KYC tiers. USD-X is refused with `422 USDX_USES_ISSUANCE`. The
  response's gross/fee/net use core-ledger's exact `Convert()` arithmetic
  (unit-tested for parity with `fx_test.go`).
- `GET /rates`, `GET /pairs`, `PATCH /pairs/:base/:quote` (audited),
  behind the new `pricing` resource client's roles (`pricing.quote`,
  `pricing.read`, `pricing.admin`). Own database (`pricing` /
  `pricing_test`), own migrations, audit outbox relay.

### Changed — wiring

- Keycloak realm template: the `pricing` bearer-only resource client with
  its roles; the confidential `svc-pricing` service account holding
  `ledger.pricing` (the role's only holder); svc-bff and svc-payments get
  pricing.quote/pricing.read, and svc-bff also gets pricing.admin and the
  user-proxy role for audited pair changes.
- `scripts/stack.sh` starts pricing on host port 13009 with the stub feed;
  `infra/postgres/init/07-pricing-database.sql` and CI's database step
  create its databases; `infra/k8s/pricing-deployment.yaml` deploys it on
  port 3006 with live feeds.

## 2026-11-26 — Multi-asset ledger (slice 1 of multi-asset wallets)

### Added — custodial BTC/ETH/SOL, crypto FX and pay-with-conversion in core-ledger

- `DefaultCurrencies()` gains BTC (8dp), ETH (18dp) and SOL (9dp). These are
  custodial: the chain comes from the currency (BTC→`BITCOIN`, ETH→`ETHEREUM`,
  SOL→`SOLANA`), and a wallet carries no address (`WRONG_CHAIN`,
  `UNEXPECTED_ADDRESS`). Each gets an FX position, an FX spread, a "Crypto
  at custodian" and a "Crypto in transit" account. USD-X's chart and wallet
  rules are unchanged.
- `Convert` now accepts every pair except those involving USD-X, which still
  crosses only through issuance and redemption (`USDX_USES_ISSUANCE`).
  Before, it accepted fiat↔fiat only.
- New `PayConverted` flow and `POST /fx/payments` (role `ledger.settlement`).
  One journal debits the payer in one currency and credits a different
  owner's wallet in another, across a quote. This is the basis for paying
  with any wallet.
- Default wallets: `wallets.is_default`, at most one per (user, currency),
  set via `PATCH /wallets/:walletId`, which also renames a wallet (labels are
  trimmed, with a 64-rune maximum).
- Migration `00010_multi_asset.sql`.

### Changed — FX quotes can no longer be set by users or reused

- `POST /fx/quotes` is reachable only with the new `ledger.pricing` role
  (added to the Keycloak realm template). bff's user-proxy role can no
  longer choose its own rate.
- A quote is single-use: a partial unique index on
  `transactions(fx_quote_id)` covers FX conversions and payments; reversals
  are excluded. Reuse fails with `QUOTE_ALREADY_USED` (409), while an
  idempotent replay still returns the original transaction.
- A quote can be pinned to an exact `from_amount` and a `party_id`
  (`QUOTE_AMOUNT_MISMATCH`, `QUOTE_PARTY_MISMATCH`), so the pricing service's
  exposure check covers exactly one movement.

## 2026-11-26 — Hardening H1–H7 brought into main

### Changed — the stacked hardening branches reach `main`

- PRs #31–#38 each merged into the previous branch in the stack, so none
  of H1–H7 (or the 2026-11-26 fixes) was on `main`. This merge brings
  `feat/hardening-h6`, which holds the whole stack, into `main`.
- Conflicts with the UI refresh (#33): `ops-console/App.tsx` had the same
  `ConsoleEntry` twice, so one copy is kept; `StaffEntry.tsx` takes main's
  version with its motion utilities; `AppShell` keeps both the
  `max-w-8xl` content width and main's `animate-rise` page transition.

## 2026-11-26 — CI: the H7 NATS auth suite runs instead of skipping

### Fixed — the Go workspace job failed on three skipped tests

- `.github/workflows/ci.yml`: the Go job now starts `nats:2.10-alpine` with
  `infra/nats/nats.conf` and the dev passwords, then sets `NATS_TEST_URL`.
  The H7 `TestNATSAuth*` suite skips without that variable, and the job's
  no-skip guard failed the run. The broker is a `docker run` step, not a
  service container, because service containers start before checkout and
  can't mount the config file.
- `Makefile`: `test-integration` passes `NATS_TEST_URL` (default
  `nats://localhost:54222`, compose's broker), so the same skip no longer
  fails it locally.

## 2026-11-26 — Ops Console entry page; Keycloak login surface synced per portal

### Fixed — the Ops Console redirected straight to Keycloak

- `frontend/ops-console`: a signed-out visit to `/` now renders a staff entry
  page (`pages/StaffEntry.tsx`, ported from `feat/ui-refresh`) with a
  "Continue with company sign-in" button, instead of bouncing to Keycloak.
  Deep links (`/kyc`, `/wallets/…`) still go straight to sign-in and return.

### Fixed — the running realm drifted from `damp-realm.json`

- `scripts/keycloak-sync.sh` gains `sync_realm_front_door`. From the realm file,
  it re-applies the realm login settings (`loginTheme: damp`, self-registration,
  remember-me, password reset), the `default-roles-damp` composites (a
  self-registered user gets `customer` again), and the `damp-portal` / `damp-ops`
  SPA clients. A dev `kcdata` volume keeps its first import, so the live realm
  had no login theme, had registration switched off and had no default
  `customer` role.

### Changed — the staff sign-in is distinct from the customer sign-in

- The `damp` login theme detects `client.clientId == "damp-ops"`. That variant
  shows "Staff sign-in" with staff brand copy and no "Create account" link.
  The portal's sign-in drops "and DAMP staff" from its lede.

## 2026-11-26 — stack.sh: recycled pids are never mistaken for ours

### Fixed — `scripts/stack.sh` trusted any live process holding a recorded pid

- **Pid files now record the pid plus that process's start time**
  (`LC_ALL=C ps -o lstart=`), and every ownership check (`status`, `up`,
  `down`) goes through a new `owned_pid` that requires the start time to
  match. Before, `kill -0` was the only check, so after a reboot a pid the OS
  had recycled to an unrelated process was treated as the service: `up`
  printed "already running" and skipped bff (its old pid was a Chrome
  renderer), and `down` would have sent TERM/KILL to that process or its
  group.
- A stale pid file (dead or recycled pid) is removed, the service is treated
  as not running, and `down` reports "not running (stale pid file removed)"
  without signalling anything.
- Legacy one-line pid files written by the previous version are accepted
  only when the process's working directory is inside the repo (every
  service is launched via `cd '<dir>' … exec`), and are upgraded in place —
  a stack started before this change is not orphaned.

## 2026-11-24 — H7: NATS credentials and per-correlation re-sign allowance

### Changed — NATS authenticates one user per service with per-subject permissions (target bar: real money)

- **`infra/nats/nats.conf` replaces the unauthenticated `-js -sd /data -m 8222`
  command line.** The broker now declares three users, each with the
  narrowest subject permissions its role needs: **`core-ledger`** (publish
  `damp.>`, `$JS.API.INFO` and `$JS.API.STREAM.{CREATE,UPDATE,INFO}.DAMP` for
  the idempotent DAMP stream create/update; subscribe `_INBOX.>`),
  **`notifications`** (subscribe `damp.>` and `live.notifications.push.v1`;
  publish `live.notifications.push.v1` plus `$JS.API.INFO`,
  `$JS.API.CONSUMER.{CREATE,DURABLE.CREATE,INFO,MSG.NEXT}.DAMP.>`,
  `$JS.API.STREAM.INFO.DAMP` and `$JS.ACK.DAMP.>`), and **`compliance`**
  (subscribe only `damp.ledger.chain_enforcement_finalized.v1` plus that same
  consumer API/ack surface — it cannot publish `damp.>` or live pushes).
  Passwords are read from env vars in the config (`$NATS_*_PASSWORD`), so no
  secret is committed; docker-compose passes dev values and keeps the same
  `natsdata` volume, so the DAMP stream and every consumer cursor survive the
  switch. The monitor endpoint and healthcheck are unchanged.
- **Least privilege extends to JetStream administration: no user may delete
  or purge a stream or consumer.** The API subjects are enumerated per
  operation each client actually performs (create/update/info for
  core-ledger; create/durable-create/info/msg-next plus stream-info for the
  consumers) — there is no `$JS.API.STREAM.DELETE`, `$JS.API.STREAM.PURGE`
  or `$JS.API.CONSUMER.DELETE` in any allow list, so the forensic value of
  the DAMP stream cannot be destroyed through the broker by any credential
  the platform issues. That removed the e2e suite's own cleanup, so
  notifications' outbox consumer gained an optional
  `OUTBOX_CONSUMER_INACTIVE_THRESHOLD_MS` (unset in every real deployment)
  and its test durables are created with `inactive_threshold` — the server
  expires them instead of the test deleting them.
- **Every client authenticates and fails at boot without credentials.**
  core-ledger's worker (`NATS_USER`/`NATS_PASSWORD`, validated by
  `config.validateNATS`), notifications (`NatsService` refuses to start with
  a URL and no credentials) and compliance (`OutboxConsumer` refuses to
  start likewise). compliance's consumer is the money path for H6
  enforcement finality, so its permission or auth failures are logged at
  **error** on a slow retry beat — a denied consumer must not sit quietly
  while enforcement events pile up unconsumed.
- **Tests prove the permissions.** A new guarded integration suite
  (core-ledger/internal/outbox, `NATS_TEST_URL`) asserts wrong passwords are
  refused, core-ledger cannot publish outside `damp.>`, and neither
  notifications nor compliance can publish `damp.>`; notifications' existing
  NATS e2e suites now connect with credentials (their test publisher
  connects as `core-ledger`, the only user that may publish `damp.>`).
- Config/env/k8s updated throughout: `.env`/`.env.example` for the three
  services, `scripts/stack.sh` host-side overrides, and the k8s manifests
  (worker, notifications, compliance) read the passwords from a new
  `nats-credentials` Secret (keys `core-ledger-password`,
  `notifications-password`, `compliance-password`).
  `nats-networkpolicy.yaml`'s comment now reflects that it is defence in
  depth, not the whole story.

### Changed — the signer's re-sign cap can be raised for one correlation at runtime, audited

- **`POST /resign-allowances` and `GET /resign-allowances/:correlationId`**
  on the signer (HTTP/2 + mTLS like everything else). A body
  `{correlation_id, extra, reason, granted_by}` grants `extra` (1–10,
  enforced by the table's CHECK) additional re-signs for that correlation
  for `RESIGN_ALLOWANCE_TTL` (default 24h). Authorization is policy:
  `resign_allowance.allowed_callers` in policy.example.yaml (`[ops]`),
  default deny; `granted_by` must match the authenticated mTLS CN. A second
  active grant is refused with **409 `RESIGN_ALLOWANCE_EXISTS`** — the chain
  is the grant history, and an overwritten grant would leave it claiming a
  cap that no longer holds.
- **The grant itself is append-only evidence.** New
  **`resign_allowances` table (signer migration 00004)** holds the current
  allowance (correlation_id PK, extra 1–10, granted_by, reason, expires_at),
  and every grant is also written through the hash-chained audit log as
  method `resign-allowance` (own audit-trail action
  `signer.resign_allowance.granted`) in the same transaction — erasing a
  grant breaks the chain detectably. `ResignAllowed` and the in-transaction
  cap check in `Append` count the active allowance's `extra` on top of
  `MAX_RESIGNS_PER_CORRELATION`; an expired allowance counts for nothing.
- **Runbook:** [docs/runbooks/resign-allowance.md](docs/runbooks/resign-allowance.md)
  walks the operator flow — dead letter carrying `RESIGN_LIMIT_REACHED` →
  grant the allowance → resolve the dead letter — and what not to do
  (raising the global cap is not the answer).

## 2026-11-24 — H6: compliance enforcement reaches the chain

### Changed — BLACKLIST/UNBLACKLIST/PAUSE/UNPAUSE are submitted on chain through core-ledger, durably and asynchronously (target bar: real money)

- **core-ledger gains `POST /chain/enforcement` and `GET /chain/enforcement/:reference`**,
  guarded by a new client role `ledger.enforcement` granted to
  `svc-compliance` alone. The POST validates hard (unknown action/chain →
  422; `(UN)BLACKLIST` needs a valid address and is Ethereum-only — 422
  `UNSUPPORTED_ON_CHAIN` on Solana; `PAUSE`/`UNPAUSE` pre-check the pause
  authority by reading the chain — Ethereum `PAUSER_ROLE`, Solana
  `BridgeConfig.admin` vs the signer — and refuse with 422 `NOT_CHAIN_ADMIN`
  rather than pay gas for a reverting transaction), then records one row in
  the new **`chain_enforcements` table (migration 00009)** keyed by the
  compliance action id and answers **202 SUBMITTED as soon as the
  transaction is broadcast**. It never waits for finality inside the HTTP
  request — Sepolia's finalized checkpoint trails the head by two epochs,
  and the first (synchronous) cut proved it: the wait expired, the caller
  saw a 502, and a retry would have submitted the action twice. The row is
  the dedupe: **a reference that ever obtained a tx hash is never
  resubmitted**; a retried request reads the stored state (200 for
  FINAL/FAILED, 202 for SUBMITTED) and submits nothing. A transient submit
  failure with no hash deletes the row so a retry can start clean; a
  terminal refusal marks it FAILED and answers 409. Each submission is
  audited on the outbox (`ledger.chain.enforcement_submitted`).
- **The worker owns finality** — a new sweep (`internal/enforcement`,
  running in `cmd/worker`) claims due SUBMITTED rows the saga queue's way
  (FOR UPDATE SKIP LOCKED, `next_check_at` as the lease, `attempts` as the
  budget) and asks the chain exactly one immediate question per row via the
  new **`FinalityStatus`** method on the enforcement client interface
  (Ethereum: receipt + depth check, no polling; Solana: one
  `getSignatureStatuses` at `finalized`). FINAL (or a mined revert, or a
  spent ~2-hour budget) flips the row **and enqueues
  `damp.ledger.chain_enforcement_finalized.v1` in the same transaction** —
  the outbox guarantee: compliance is told exactly when the chain state is
  known.
- **services/compliance marks EXECUTED when the chain is final.** The
  ingest door (HTTP `/internal/outbox`, and a new JetStream consumer
  `compliance-enforcement` filtering
  `damp.ledger.chain_enforcement_finalized.v1` — the local stack's relay
  publishes to NATS, so without it the event would sit in the stream
  forever) routes the event to the enforcement service, which looks the
  action up by reference and records EXECUTED (with the tx hash) or FAILED
  (with the reason) plus its audit event — idempotent on redelivery,
  unknown references ignored. On 202 the action records **SUBMITTED**
  (new status, migration 003); on a terminal 409 it records FAILED; on a
  transient failure it stays APPROVED with a retryable reason — safe
  because core-ledger dedupes on the action id.
- **Both chain clients grow the enforcement surface.** Ethereum:
  `Blacklist`, `Unblacklist`, `Pause`, `Unpause` via the abigen binding,
  signed through the Signer seam with the method names a remote signer's
  policy matches (`blacklist`/`unblacklist`/`pause`/`unpause`) and the
  compliance action id as the correlation id. Solana: `Pause`/`Unpause` map
  to the program's `set_paused` instruction (`AdminOnly` account order);
  `IsPauseAuthority` compares the signer to the on-chain `BridgeConfig.admin`.
- **services/signer learns the new methods.** `unblacklist` joins the
  Ethereum decoder; the Solana decoder recognises `set_paused` (config PDA +
  fee-payer-admin checks, one Borsh bool) and reports it as
  `pause`/`unpause` so one policy vocabulary covers both chains.
  `policy.example.yaml`: the enforcement rules list
  `allowed_callers: [core-ledger]` — compliance acts through core-ledger,
  not directly. (`core-ledger` must be the mTLS CN of core-ledger's client
  certificate in a real deployment.)
- **Keycloak:** `ledger.enforcement` role on the `core-ledger` resource
  client, scope-granted to `svc-compliance` (template + `make keycloak-realm`
  output + `scripts/keycloak-sync.sh` data).
- **workflow's seeded `compliance.blacklist` pool gains `admin`** (migration
  003 fixes existing databases) — the previous pool had no second person who
  could approve, since the proposer is excluded.
- **e2e harness gains an `enforcement` step** (FULL mode; self-skips in
  `--fast`): generates a throwaway address, checks (read-only) that the
  relayer holds `COMPLIANCE_ROLE` — if not, it SKIPs with the exact
  `cast send … grantRole` command an admin would run and does not run it —
  then drives BLACKLIST and UNBLACKLIST through the real product path
  (compliance raises via the gateway, a self-approval is refused, admin
  approves, the action records SUBMITTED, and the poll to EXECUTED — with
  the run's `--timeout-min` budget — rides the worker's finality sweep) and
  asserts `isBlacklisted()` flipped on chain. Never pauses the shared
  testnet contract.


### Fixed — found by the live run
- The first version waited for chain finality inside the HTTP request
  (5-minute cap; Sepolia takes ~15). It returned 502, and a retry would have
  submitted the transaction a second time. That is why it was redesigned to
  run asynchronously, as described above.
- compliance's JetStream consumer never started locally, because `NATS_URL`
  was unset for it. The core-ledger worker only relays to NATS, so the
  finality event never reached compliance and the action sat at SUBMITTED
  although the blacklist was final on chain. `stack.sh`, `.env.example` and
  the k8s manifest now set it, and the NATS NetworkPolicy admits compliance.
- The consumer used `DeliverPolicy.New`, so any event finalized before the
  durable first existed was lost for good. It now uses `DeliverPolicy.All`:
  the subject filter keeps the backlog to enforcement events, and applying an
  outcome is idempotent. On restart the stuck action above recovered by
  itself.
## 2026-11-24 — H5: KYC gates every money movement

### Changed — no money moves for a party whose KYC tier is below the configured minimum (target bar: real money)

- **New kyc endpoint `GET /internal/parties/:partyId/tier`**, guarded by the
  H3 service guard with a new client role `kyc.tier-read` (granted to
  `svc-payments` and `svc-bff`; the existing `kyc.user-proxy` does not reach
  it). Returns `{partyId, tier: {name, rank}, status, tiers}` — a party with
  no record is TIER_0 (rank 0), the default that can do nothing by
  construction, and the full ordered tier list lets callers resolve the rank
  of the minimum tier they demand without hardcoding ranks. Realm template,
  `make keycloak-realm` output and `scripts/keycloak-sync.sh` lists all
  updated (`svc-payments` also gains the `kyc` audience mapper).
- **`KycGate` in `@damp/nest-platform`** — the shared money-path gate.
  `require(partyId, minimumTier)` fetches the tier from kyc with the
  caller's own service-account token, compares by rank, and throws
  `403 KYC_REQUIRED` ("verification tier <X> required; current <Y>") when
  below, `503 KYC_UNAVAILABLE` when kyc is unreachable, answers non-2xx, or
  does not define the minimum tier — fail CLOSED, nothing is cached (a
  revoked tier must bite on the next request). KYC_URL empty behaves as
  unreachable; there is no disable switch.
- **payments gates every intent creation.** All three directions move value
  into or out of the party's wallet (DEPOSIT funds it, WITHDRAWAL drains it,
  TRANSFER — P2P and invoice pay — moves it), so every intent is checked
  against `KYC_MIN_TIER_FIAT` (default `TIER_1`, the first non-zero tier)
  before any write, core-ledger call or rail call. New config `KYC_URL` +
  `KYC_MIN_TIER_FIAT`, wired through `.env`/`.env.example`, `stack.sh` and
  `infra/k8s/payments-deployment.yaml`.
- **bff gates its customer money-movement routes.** `POST /issuances`,
  `/redemptions`, `/bridges` and the customer-facing `/transfers` check the
  caller's tier against `KYC_MIN_TIER_ISSUANCE` (default `TIER_1`) before
  any wallet lookup or core-ledger call. The operator-only `/deposits` and
  `/withdrawals` are deliberately NOT gated — an operator adjusts any
  wallet by design, and their permission (`wallets:adjust:manual`) is the
  control.
- **kyc freezes wallets on rejection.** `CasesService.reject` now calls
  `CoreLedgerClient.setWalletsFrozen` (previously dead code) when the
  rejection leaves the party below every tier (rank ≤ 0) — a rejected
  *upgrade* keeps the tier already held and is not frozen. Idempotent:
  re-deciding a decided case never reaches it, and the status write goes
  through core-ledger's existing `POST /wallets/:id/status` so there is
  still exactly one freezing mechanism. Audit trail: `kyc.case.rejected`
  plus core-ledger's own wallet-status event, the mirror of the approval
  path's `kyc.case.approved` + `setWalletsActive`.
- **e2e harness (`scripts/e2e/money-flows.mjs`) gains a `kyc` step** (after
  `wallets`): brings `customer@damp.local` and `company@damp.local` to
  TIER_1 through the real product path — open a case, request upload slots,
  upload documents (MinIO when configured; otherwise the documented
  unconfigured-storage stub), submit, then approve the maker-checker
  request as `compliance@damp.local` through the gateway — idempotent (a
  party already at/above the tier passes immediately). The `negatives` step
  now also creates a throwaway customer via the Keycloak admin API, lets
  identity JIT-provision its party on first gateway call, and asserts
  `403 KYC_REQUIRED` on a deposit intent and on an issuance (plus a
  customer transfer), then deletes the user.

## 2026-11-23 — H4: break-glass redemption needs approval and on-chain proof

### Changed — the break-glass redemption confirm can no longer release fiat on an operator's word (target bar: real money)

- **`POST /redemptions/:id/confirm` no longer settles anything.** It
  validates the claim (the redemption exists, is a redemption, its saga is
  not already settled, the hash has the source chain's shape), proposes a
  maker-checker approval in services/workflow (action
  `redemption.break_glass`, the policy seeded since P5: one approver,
  `treasury` or `admin`, initiator excluded), records the proposal in a new
  `break_glass_requests` table (one PENDING row per redemption, enforced by
  a partial unique index) and returns `202 {status: PENDING_APPROVAL,
  approval_request_id}`. workflow unreachable → 502 `WORKFLOW_UNAVAILABLE`,
  never a wave-through.
- **The decision callback settles nothing by itself either.**
  `POST /internal/approvals/callback` is HMAC-authenticated with
  `WORKFLOW_CALLBACK_SECRET` (the same scheme kyc/compliance verify; the
  route is a JWT-exempt `hmacPaths` entry in core-ledger's auth boundary,
  the Go twin of H3's `@HmacAuthenticated`). It binds the callback to the
  request id the proposal recorded, re-derives the payload digest from the
  saga as it stands (a Go port of workflow's canonical digest encoding,
  pinned against the Node side by cross-language test vectors), and only
  then — on APPROVED — proves the burn on chain before calling the old
  settlement path. Rejection marks the row REJECTED; a failed proof marks
  VERIFICATION_FAILED with the typed reason and moves no money. Redelivered
  callbacks are idempotent.
- **On-chain burn verification (`VerifyBurn`) on both chain clients.**
  Ethereum: receipt must exist, have succeeded, be for the USDX proxy, have
  reached the configured finality depth (the same CHAIN_FINALITY vocabulary
  the saga's wait uses — checked, not waited for), and carry exactly one
  `BridgeBurned` with the right source, amount and correlation id. Solana:
  the transaction read at `finalized` commitment must have succeeded and
  contain the `bridge_burn` instruction for the configured program, with
  the amount (u64 LE) and correlation id ([u8;32]) decoded from the same
  layout `encodeBridgeArgs` writes, and the source token account (index 2
  of the instruction's accounts) equal to the ATA derived from the source
  wallet and mint. Typed outcomes in `internal/bridge`: `ErrBurnNotFound`,
  `ErrBurnReverted`, `ErrBurnNotFinal`, and `ErrBurnMismatch{Field}`
  ("contract", "from", "amount", "correlation_id", "count"). Both clients
  also expose `ValidTxHash` so a malformed hash is refused before it is
  asked to be believed.
- **`GET /redemptions/:id/break-glass`** returns the proposal's lifecycle
  row (status, requester, workflow request id, failure reason) for the ops
  console / e2e harness to poll. Proxied by bff, gated on `ledger:read` at
  auth-proxy (treasury and admin hold it; customers do not), typed in
  `@damp/web-shared`'s `ledgerAdminApi` (`breakGlass()`, and
  `confirmRedemption` now returns the 202 proposal shape).
- **core-ledger's API server is now an authenticated caller.** New Keycloak
  client `svc-core-ledger` (client-credentials, `workflow.propose` on the
  workflow resource client; the worker keeps its separate
  `svc-core-ledger-worker`), new config `WORKFLOW_URL`,
  `WORKFLOW_CALLBACK_SECRET`, `CORE_LEDGER_SELF_URL`; the server builds its
  `internal/serviceauth` client at boot (fatal when unconfigured) and a new
  `internal/workflowclient` proposes approvals with it. Realm template,
  `make keycloak-realm` output and `scripts/keycloak-sync.sh` lists all
  carry the new client; `core-ledger/.env` now names the server's client
  (stack.sh keeps overriding the worker's two SERVICE_* lines); the k8s
  server deployment reads its secret from `core-ledger-secrets` key
  `server-service-client-secret` (the worker keeps `service-client-secret`)
  and the callback secret from the shared `workflow-callback` secret.
- **Tests.** Go: VerifyBurn suites for both clients against recorded
  RPC-shaped fixtures (good / wrong amount / wrong from / wrong correlation
  / reverted / not final / not found / wrong contract or program); workflow
  client digest + HMAC vectors pinned against services/workflow's TS suite;
  handler suite (real Postgres, faked workflow + router) covering propose-
  and-don't-settle, settled-saga refusal, bad-hash refusal, workflow-down
  refusal, double-proposal 409, bad HMAC 401, approved+verified settles
  exactly once, approved+mismatch → VERIFICATION_FAILED with the ledger
  untouched, rejected, digest-mismatch refusal, unknown-request refusal, and
  the status route. Node: workflow seed pin for the `redemption.break_glass`
  policy, bff operations-proxy coverage for the new GET.
- **e2e harness** (`scripts/e2e/money-flows.mjs`, new `break-glass` step —
  self-skips in `--fast`, documented in `scripts/e2e/README.md`): full mode
  creates a fresh 5.00 redemption, treasury proposes break-glass with a
  random fake hash (202, nothing settles), treasury cannot approve its own
  request (403), admin approves, the row reaches VERIFICATION_FAILED, the
  saga stays in flight and the fiat wallet does not move; the worker still
  settles that redemption the ordinary way afterwards.

### Fixed
- **core-ledger migrations run under a Postgres advisory lock** (goose
  provider with a session locker). The server and the saga worker both
  migrate at boot. The first new migration since they started running side
  by side (`00008`) had them race the same `CREATE TABLE`, and the worker
  failed to start. Multiple k8s replicas would have raced the same way.
- **e2e harness:** a saga poll keeps polling through a transient
  gateway 502/503/504 instead of treating it as the saga's answer. The
  break-glass step reads the redemption id from `transaction.id`.

## 2026-11-23 — H3: internal hops authenticated

### Added — service-account auth on every internal HTTP hop (target bar: real money)

- **Every internal HTTP hop now carries a Keycloak service-account JWT.**
  H2 authenticated core-ledger; H3 does the same for every other receiver:
  payments, workflow, kyc, compliance, reporting, rms, notifications,
  identity, audit-trail, and indexer. Each gets a bearer-only resource
  client with client roles; each caller mints one token carrying every
  audience it talks to. There is no disable switch.
- **`ServiceAuthGuard`** in `shared/node/nest-platform`, installed as a
  global `APP_GUARD` by each Node receiver: verifies the bearer via OIDC
  discovery + auto-rotating JWKS (`jose`), checks `AUTH_ISSUER_URL` +
  `AUTH_AUDIENCE` (= the service's resource client), then the route's
  declared roles. Missing/invalid → 401 `UNAUTHENTICATED`; wrong role →
  403 `FORBIDDEN`. Decorators: `@RequireServiceRole(...roles)` (default for
  an unmarked route: `<svc>.user-proxy`), `@Public()` (payments' rail
  callback — the `RAIL_CALLBACK_SECRET` check stays), and
  `@HmacAuthenticated()` (workflow's decision callbacks — the HMAC check
  stays). `/healthz`, `/readyz`, `/version` and `/metrics` are exempt.
- **Identity headers are no longer trusted on the network alone.**
  `serviceIdentityFrom` (nest-platform) releases X-User-Id/X-Org-Id/X-Roles/
  X-Permissions only when the verified token's `resource_access` holds
  `<svc>.user-proxy` — granted to svc-bff and nothing else. The per-service
  decorators (payments/kyc/compliance/notifications/reporting `CurrentUser`,
  workflow `CurrentActor`, rms `Actor`, reporting `Permissions`) delegate to
  it, keeping their existing shapes. workflow's one deliberate exception:
  a `workflow.propose` caller's X-User-Id is read as audit-only identity
  (recorded as `requested_by`, never checked against a policy).
- **Keycloak surface** (realm template + `make keycloak-realm` +
  `scripts/keycloak-sync.sh`, now fully data-driven — adding a receiver or
  caller is a list entry, not a helper): 9 new resource clients
  (`payments`, `workflow`, `kyc`, `compliance`, `reporting`, `rms`,
  `notifications`, `identity`, `audit-trail`, plus `indexer` for the saga's
  finality check) and 4 new confidential clients (`svc-core-ledger-worker`,
  `svc-auth-proxy`, `svc-workflow`, `svc-notifications`). Roles:
  `<svc>.user-proxy` (svc-bff) everywhere; `notifications.ingest`
  (svc-payments, svc-core-ledger-worker); `compliance.ingest`
  (svc-core-ledger-worker); `identity.resolve` (svc-auth-proxy,
  svc-notifications); `workflow.propose` (svc-kyc, svc-compliance);
  `audit-trail.ingest` (every producer's client); `audit-trail.user-proxy`
  (svc-bff, svc-reporting); `indexer.finality` (svc-core-ledger-worker).
- **Callers attach tokens:** bff's `UpstreamProxy` adds its own bearer to
  every forward (one token, nine audiences); payments' outbox relay
  (notifications.ingest); kyc/compliance workflow clients
  (workflow.propose); reporting's audit extract (audit-trail.user-proxy);
  core-ledger's worker (new `internal/serviceauth`; `golang.org/x/oauth2/
  clientcredentials`) for the outbox relay and the indexer finality check —
  `SERVICE_CLIENT_ID/SECRET` are optional in core-ledger's config and
  required only by the worker binary; auth-proxy's identity resolver
  (identity.resolve).
- **audit-trail** accepts either the existing `INGEST_TOKEN` or a service
  JWT with `audit-trail.ingest` for recording; reads now require
  `audit-trail.user-proxy`. Producers still send `INGEST_TOKEN` this slice
  (migration is the follow-up); signer's relay stays on `INGEST_TOKEN`
  (its other calls are already mTLS).
- **indexer** verifies its read surface against the `indexer` resource
  client: `GET /finality` requires `indexer.finality`; `/events` and
  `/cursors` have no caller and fail closed.
- **notifications' WebSocket auth** has no unverified mode left: the portal
  already sends its Keycloak access token as a query parameter (unchanged),
  and `ws.auth.ts` verifies it (realm `damp`, aud `damp-portal`) and resolves
  the party via identity with notifications' own service token. The old
  partyId/dev-user fallback survives only behind
  `ENV=local` + `NOTIFICATIONS_WS_DEV_AUTH=true`, both required.
- **Tests:** `FakeIssuer` in nest-platform (in-process OIDC discovery +
  JWKS + token minting, exported for service suites); guard spec (12 cases);
  audit-trail JWT-door specs; indexer auth-boundary spec.
- **e2e negatives:** direct payments GET with forged X-User-Id and no token
  → 401; direct notifications `/internal/events` with no token → 401; direct
  payments call with svc-payments' own token (wrong audience) → 401.
- **k8s:** every receiver manifest sets `AUTH_ISSUER_URL`/`AUTH_AUDIENCE`;
  notifications, core-ledger worker and auth-proxy add `SERVICE_CLIENT_ID` +
  `service-client-secret` secret refs (`notifications-secrets`,
  `core-ledger-secrets`, `auth-proxy-secrets`). An operator must create
  those secret keys before deploying.

### Fixed
- Two boot failures that only showed on a real start, not in unit suites:
  payments' outbox relay could not resolve `ServiceTokenClient`
  (`CoreLedgerModule` now exports it), and notifications rejected
  `NOTIFICATIONS_WS_DEV_AUTH=false` from its `.env` because nothing converted
  the string to a boolean.
- **notifications' outbox-consumer e2e suite no longer fails on live dev
  events.** Each test's durables now start at the shared DAMP stream's
  current position (`OUTBOX_CONSUMER_START_SEQUENCE`, a test-only option), so
  real events a developer's stack left in the stream (e.g. reconciliation
  breaks from live e2e runs) are not replayed into assertions that count
  deliveries. Replicas are also stopped between tests instead of all at the
  end, so no test's consumer drains history into the next one.

## 2026-11-23 — H2: core-ledger authenticates every call

### Added — service-account auth on core-ledger (target bar: real money)
- **core-ledger authenticates every API call** with a Keycloak
  service-account JWT (`AUTH_ISSUER_URL` required, `AUTH_AUDIENCE`
  default `core-ledger`). A route table in `core-ledger/internal/api/auth.go`
  maps each route to the client roles that authorize it, default-deny; only
  `/healthz`, `/readyz` and `/metrics` are exempt. Missing/invalid token →
  401 `UNAUTHENTICATED`; valid token without the role → 403 `FORBIDDEN`.
  There is no disable switch.
- **Seven client roles** on the new bearer-only `core-ledger` resource
  client (realm template + `scripts/keycloak-sync.sh`, which upserts the
  whole H2 surface into a *running* Keycloak — an existing dev volume never
  re-imports the realm JSON): `ledger.user-proxy` (bff), `ledger.settlement`
  (payments), `ledger.wallet-provision` (identity), `ledger.wallet-status`
  (kyc, compliance), `ledger.reserves.custodian` (rms),
  `ledger.reserves.chain-supply` (indexer), `ledger.reports.read`
  (reporting). `scripts/stack.sh up` runs the sync after Keycloak is up.
- **`shared/go/platform/oidcverify`**: the verifier moved out of
  auth-proxy's `internal/` and extended with `ClientRoles`
  (`resource_access.<client>.roles`), `AuthorizedParty` (azp) and
  `HasClientRole`, so one verifier serves both auth boundaries. The fake
  issuer moved alongside it (`oidcverify/oidctest`) and mints
  `resource_access`/azp claims.
- **`ServiceTokenClient`** in `shared/node/nest-platform`: client-
  credentials against Keycloak, cached until 30s before expiry,
  single-flight refresh, typed errors. Every Node service's core-ledger
  client (and bff's operator proxy) now attaches its own service-account
  bearer; `X-Service-Token`/`CORE_LEDGER_SERVICE_TOKEN` plumbing is gone.
  identity reuses its existing `identity-service` client through the same
  shared token cache as its Keycloak Admin client.
- **indexer** mints its token through `golang.org/x/oauth2/clientcredentials`
  (`SERVICE_CLIENT_ID`/`SERVICE_CLIENT_SECRET` + Keycloak base URL/realm).
- **actor()** falls back to `service:<azp>` instead of `"api"` when a call
  carries no `X-User-Id`, so the journal names the authenticated caller.
- An unauthenticated request gets 401 on every path, before the route table
  is consulted, so it can't be used to map which routes exist.
- k8s: the core-ledger, worker and reconcile manifests set `AUTH_ISSUER_URL`.
  Every calling service's manifest (payments, rms, kyc, compliance,
  reporting, indexer, identity) carries `SERVICE_CLIENT_ID`, a
  `SERVICE_CLIENT_SECRET` secret ref, and `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM`.
  Each `<service>-secrets` needs a `service-client-secret` key before deploying.
- The e2e harness's `negatives` step now posts directly to core-ledger with
  no token (→ 401) and with a customer's gateway token — right issuer, wrong
  audience (→ 401).

## 2026-11-23 — hardening H1

### Fixed
- **A mined-but-reverted transaction is terminal.** An Ethereum receipt with
  status 0, or a Solana signature that landed with an error, was classified
  transient. The saga re-waited on a hash that can never succeed until the
  attempt budget dead-lettered it. Both chain clients now wrap
  `bridge.ErrTxFailedOnChain`, and the saga's existing terminal paths
  compensate: a mint returns fiat, and a burn returns tokens. The check runs
  after the replay guards, because a Solana `already in use` failure proves an
  earlier transaction landed.
- **M-Pesa B2C** sent the shortcode as `InitiatorName` and no
  `SecurityCredential`, so real Daraja payouts could not succeed. New config:
  `MPESA_INITIATOR_NAME` and `MPESA_SECURITY_CREDENTIAL`. Payouts are refused
  with `RAIL_UNAVAILABLE` before any HTTP call when either is unset.

### Security
- **audit-trail fails closed.** It refuses to start without `INGEST_TOKEN`
  unless `ENV=local`, and in local it warns on each unauthenticated request.
  The k8s manifest now sets `ENV=production`. Left unset, it defaulted to
  local, which would have kept production open.

### Changed
- The e2e harness checks reconciliation Leg C by delta. rms's stub custodian
  mirrors ledger cash, so only the run's movement is meaningful.

## 2026-11-23

### Changed — UI refresh: new landing pages, Interlock logo, motion everywhere
- **New mark, "Interlock".** Two diamonds stand for the ledger and the chain,
  and the filled diamond where they overlap is USD-X. It is used in both
  apps, their favicons and the Keycloak login theme. `LogoMark` gains
  `variant` (tile, light, mono) and an `animated` intro.
- **Shared motion layer** in `@damp/web-shared`:
  - scroll reveal, hover lift, arrow nudge, staggered entrances, and
    draw-in, ring and grow animations;
  - one `prefers-reduced-motion` guard, under which nothing is left hidden;
  - new components `CountUp` (counts and percentages only, never money),
    `Sparkline`, `ProgressRing`, `PulseDot`, `Marquee`, `DecorDiamonds`,
    `HeroPanel` and `FeatureCard`;
  - `PageHeader hero`, `Card interactive` and `StatTile`
    reveal/stagger/trend;
  - `DataTable` rows stagger in on first load, each route enters with a
    rise, and the active nav item animates in.
- **Portal landing rebuilt** (split into `portal/src/pages/landing/`):
  - the hero has an illustrative product preview and a ledger tape;
  - new sections for how issuing and redeeming work, the reserve checks,
    features, the four ledger rules, personal and business accounts, and
    FAQs.

  Reserve figures are deliberately absent until a public reserves endpoint
  exists. The business contact address is a placeholder, marked TODO.
- **Ops Console staff entry.** Anonymous visitors to `/` see the four
  workspaces and a company sign-in button instead of an immediate redirect.
  Deep links still go straight to Keycloak.
- **Signed-in pages in both apps** use the new components:
  - Portal:
    - the home hero and "how your money is protected" strip;
    - the horizontal USD-X saga track;
    - the tier ladder from real tier data;
    - "Waiting on a second approver" pills.
  - Ops Console:
    - the overview hero with counts that tick up;
    - the reserves coverage ring driven by the real ratio;
    - DR/CR-marked ledger totals with a balanced flag;
    - the audit drawer's previous → current hash chain.
## 2026-11-23 — live end-to-end money-flow tests

### Security — money-path holes closed
- **bff `/transfers` and `/withdrawals` never checked wallet ownership.** A
  code comment claimed core-ledger enforced it, but core-ledger has no caller
  identity, so any customer could move another user's funds. Writes now share
  `WalletOwnership` with issuance and redemption, and every write forwards the
  actor instead of booking as `"api"`.
- **bff `/deposits` credited any wallet, for any amount, with no payment rail
  behind it**, and every customer could call it. `/withdrawals` debited a
  wallet with no payout. Both are now operator-only manual adjustments
  (`wallets:adjust:manual`, granted to treasury and admin), checked at
  auth-proxy and again in bff. The portal's Move Money page creates
  DEPOSIT/WITHDRAWAL payment intents instead.
- **payments `STUB_RAIL_ENABLED` was never read.** The rail registry silently
  fell back to the stub for an unconfigured M-Pesa and for unknown rail names,
  booking ledger credit for fiat that never arrived. The flag now defaults to
  off, the stub registers only when enabled, and an unavailable rail is a 422
  `RAIL_UNAVAILABLE` before anything is persisted.
- **Go integration tests could write to the dev ledger.** On 2026-11-12 they
  ran against the `bridge` database and left test sagas and phantom issuance
  behind. `shared/go/platform/testdb` now fails any test whose DSN names a
  database not ending in `_test`, and CI uses `bridge_test`.

### Added
- `scripts/e2e/money-flows.mjs` (`make e2e`, `make e2e-fast`) drives the
  running stack through the gateway with real Keycloak tokens. It covers:
  - wallets, deposit, P2P transfer, invoice and withdrawal;
  - issuance, the ETH→SOL bridge, and redemption on each chain;
  - authorization and idempotency negatives.

  Trial balance and integrity are checked after every money step.
  Reconciliation is checked by delta (Leg A drift unchanged; Leg C ledger cash
  moves by exactly the run's net stub fiat), because the dev ledger carries
  the earlier test pollution.
- bff `POST /bridges`, ownership-checked on both wallets.
- `chains/solana/scripts/initialize-config.ts` (`npm run init-config`) creates
  P6's `BridgeConfig`, idempotently.

### Changed — local stack
- Host ports moved out of the range other local stacks hold: Node services
  to 13xxx, Go services to 18xxx, the gateway to 18082. Container and k8s
  ports are unchanged.
- `stack.sh` counts a port as up only when our own process holds it, prints
  `CONFLICT` with the holder otherwise, and refuses to start on top of one.
  `down` waits for the whole process group.
- core-ledger and its worker run from source on the host. The compose image
  dated from 2026-11-09 and predated weeks of merged code. Makefile `run*` and
  `reconcile` targets load `.env`.

### Verified live (Sepolia + Solana devnet)
All flows pass: deposit, P2P, invoice, withdrawal, a 50 USD-X issuance, the
20 USD-X ETH→SOL bridge, and redemptions on both chains.
- The first bridge attempt failed because the devnet program predated P6's
  `BridgeConfig`. The saga compensated correctly.
- The program was then upgraded (slot 525426188) and its config initialised.

## 2026-11-12

### Added — frontend redesign, split into two apps and a shared package
- **`frontend/` is now a workspace of three packages**, following
  docs/frontend-ui-prd.md §3: `frontend/portal` (Self-Service, `customer` and
  `company`, :5173), the new `frontend/ops-console` (admin, compliance,
  treasury and auditor workspaces in one shell, :5174), and
  `frontend/shared` (`@damp/web-shared`), which both build on.
- **`@damp/web-shared`** contains:
  - the design tokens;
  - Keycloak auth-code + PKCE with refresh driven by the token's own expiry
    (the old client assumed 30 minutes against a 300s token);
  - role → permission expansion from `shared/authz` and the route and
    control guards;
  - the gateway client (one retry after refreshing on a 401, an
    Idempotency-Key per confirm step, readable errors) and one API module per
    domain;
  - UI components, the `AppShell` layout (floating navy sidebar with
    permission-filtered nav), and the 404/403/500 pages.
- **Portal rebuilt** on the shared package:
  - landing page, home, wallets and statements, deposit/withdraw/transfer
    with a review step, USD-X issue/redeem with a saga stepper, transactions;
  - payments, including the public `/pay/:token`;
  - verification with document upload, live notifications, approvals, and
    settings.
  - The template code is deleted: 252 files, Redux, and 15 unused
    dependencies. The FX UI is gone because bff has no FX route.
- **Ops Console**:
  - wallet and transaction lookup with freeze and a reversal preview;
  - approvals;
  - KYC review, alerts, cases and SAR, enforcement;
  - reserves and reconciliation (legs A/B/C), custodians, attestations,
    ledger;
  - audit trail with Merkle proofs, and reports with CSV export.
  - An auditor-only user gets no mutating control (covered by a test).
- **bff proxies the operator routes** auth-proxy already authorizes: rms
  (new `RMS_URL`) and core-ledger (`/accounts*`, `/ledger/*`, reconciliation
  runs and breaks, reversal, break-glass redemption confirm).
- **Keycloak login theme** `infra/keycloak/themes/damp`, extending `base`. It
  has custom sign-in and register pages, styles every other login page through
  `kc*Class` mappings, and is mounted by docker-compose.
- **Realm**:
  - self-registration is on, for retail customers only;
  - password policy is `length(12)`, not username, not email;
  - new public client `damp-ops` (PKCE only, adds the `damp-portal` audience
    for auth-proxy);
  - Traefik CORS allows :5174.

### Fixed — realm default role
- `make keycloak-realm` overwrote `roles.realm`, so the default role's
  composites were lost on import. Keycloak reads them from that list, not the
  `defaultRole` field. The generator now appends the default role and the
  built-in roles it composes.

### Added — audit producers for every remaining service
- **identity** (party, org and owner-membership creation), **payments**
  (intents created/cancelled/settled/failed, wrong-amount rail callbacks as
  DENIED, bank accounts registered/verified/removed, beneficiaries, invoices
  issued/voided), **rms** (reserve targets, custodian drift, attestations
  created/refused/published), **reporting** (report runs with their result
  hash, CSV exports, Superset guest tokens issued/refused) and **core-ledger**
  (wallet creation, chain-supply and custodian snapshots with the value an
  overwrite replaced) each write an `audit_outbox` event in the same
  transaction as the change.
- **signer forwards every signature and refusal** to audit-trail from the same
  SERIALIZABLE transaction as its own hash-chained row, carrying that row's
  hash so the two records can be cross-checked: one place answers "who moved
  this money". Its egress NetworkPolicy allows audit-trail:8085.
- **payments outbox metrics**: `payments_outbox_pending_events`,
  `payments_outbox_delivered_total`, `payments_outbox_dead_lettered_total`. A
  DEAD row used to be only a log line.

### Changed
- `PlatformModule.forRoot` is global, so `PlatformMetricsService` reaches
  feature-module providers; an `@Optional()` injection outside the root module
  resolved to undefined and its metrics never appeared.
- identity's JIT provisioning creates party, org and membership in one
  transaction (a crash between them left a company login with no membership).
- rms `PUT /reserves/targets/:currency` writes the path's currency — it read
  only the body's — and refuses a mismatched body.
- reporting's CSV export requires `X-User-Id` (it was the one anonymous way to
  take data out), and an export or guest token is handed over only after its
  audit event commits.

### Fixed
- core-ledger `EnsureWallet`: a request that lost the creation race no longer
  commits an orphan wallet account into the trial balance.

### Fixed — infrastructure gaps
- **audit-trail and reporting had no k8s manifests**, although the P7 entry
  above claims one, so every producer's relay pointed at a Service that did not
  exist. `infra/k8s/p7-services.yaml` adds both. audit-trail runs one replica
  with `Recreate`: its anchoring loop has no leader election, and two replicas
  could close overlapping windows that both pass `UNIQUE (from_seq, to_seq)`.
  Ingress is the four producers, bff, reporting and observability; egress is
  Postgres and DNS. core-ledger's NetworkPolicy now admits reporting, which
  reads every figure from it.
- **NATS is reachable only by its two clients.** It has no auth, and
  notifications pushes whatever arrives on `live.notifications.push.v1` to
  customer sockets. `infra/k8s/nats-networkpolicy.yaml` limits :4222 to
  core-ledger-worker and notifications (assumes pods labelled `app: nats`).
- **kyc's presigned PUT signs Content-Type.** A slot issued for one type
  accepted anything. Setting ContentType on the command was not enough — the
  presigner signs `host` alone unless told otherwise (`signableHeaders`), which
  the MinIO spec's new negative case caught.
- **MinIO's pinned image could not be pulled**: upstream no longer publishes
  community images. Compose and CI use
  `pgsty/minio:RELEASE.2026-08-04T00-00-00Z`, pinned by digest — a maintained
  rebuild with the same CLI and `mc`. MinIO left the `app` profile so tests can
  start it alone.
- **kyc's MinIO spec now runs in `make test-node` and CI**; it had skipped
  everywhere since it was written.
- **`make db-backfill`** creates every `infra/postgres/init/*.sql` role and
  database an existing volume lacks, one guarded statement at a time.
  test-node only back-filled P5, so a pre-P4 volume never got payments or
  notifications.
- Manifests are YAML-parsed and structure-checked only, never applied.

### Fixed — core-ledger events sent to JetStream never reached notifications
- core-ledger's relay has one destination and NATS wins over
  `OUTBOX_RELAY_URL`; with compose now setting the worker's `NATS_URL`, every
  ledger event, reconciliation-break alerts included, went into the `DAMP`
  stream and stopped there. notifications now runs a **durable JetStream
  consumer** (`notifications-outbox`, shared by every replica) on
  `damp.ledger.>` and `damp.reserves.>`, through the same handler and the same
  `outbox:<id>` dedupe key as `/internal/outbox`, so switching transports
  cannot double-notify.
- Acked only after handling; a database error naks with backoff, and a message
  that fails `OUTBOX_CONSUMER_MAX_DELIVERIES` (10) times, or can't be parsed, is
  terminated, logged and counted (`notifications_outbox_messages_total`).
- The stream stays core-ledger's: notifications only creates its durable and
  waits when it boots before `DAMP` exists. A new durable starts from the
  stream's retention (`OUTBOX_CONSUMER_DELIVER_POLICY=all`), so events stranded
  before this fix are delivered once. With `NATS_URL` unset nothing changes.
- One NATS connection now serves both live fan-out and the consumer, and
  `PlatformModule` is global in notifications so its metrics reach `/metrics`.

### Fixed — deliveries left PENDING by a crash were never retried
- A crash between writing a delivery row and sending left it `PENDING`, and a
  replay was skipped as a duplicate. Rows now carry a lease and an attempt
  count: a replay reclaims a row whose lease is older than
  `PENDING_STALE_SECONDS` (120), a sweeper re-sends stranded rows nobody
  replays, and after `PENDING_MAX_ATTEMPTS` (5) or 24h the row is `FAILED`.
  Taking the lease is one conditional `UPDATE`, so racing replicas re-send a
  row once. SMTP timeouts are bounded so a send cannot outlive its lease.
  Re-sends are at-least-once.

### Fixed — signer refusals were retried until the saga dead-lettered
- **core-ledger read every signer refusal as transient.** `signerclient` now
  returns typed errors for all three: `PolicyDeniedError` (403),
  `CorrelationReusedError` (409 `CORRELATION_REUSED`) and `ResignLimitError`
  (409 `RESIGN_LIMIT_REACHED`). `bridge.Classify` matches them with
  `errors.As`, before the string rules, as `ClassRefused`, because a refusal
  reason is free text that could contain "already minted".
- **A refused saga is parked, never unwound**, at any stage: dead-lettered
  with its status untouched, no ledger reversal, no compensating mint. A
  refusal arrives before a tx hash is recorded, which is the one window where
  an earlier attempt's signature may still land; unwinding there could put
  value on two chains. Resolving the dead letter re-arms the saga. A
  first-time over-ceiling MINT is therefore no longer refunded automatically;
  an operator decides.

### Added — a cap on re-signs per correlation id
- The signer re-signs rebuilt bytes for an already-signed payload at most
  `MAX_RESIGNS_PER_CORRELATION` times (default 5; 0 disables; negative fails
  boot), then answers `409 RESIGN_LIMIT_REACHED` with a DENIED audit row and
  never touches the key backend. Only one re-sign can land, but each other one
  mined on Ethereum reverts at the relayer's expense. The count is taken in
  the audit log's SERIALIZABLE append, so the cap holds across replicas;
  byte-identical replays are unaffected.

### Fixed — the frontend `build` script failed on `tsc -b`
- **`tsc -b` is clean (76 errors → 0)** and `npm run build` succeeds.
  `vite build` alone could fail too: `redux/store` imported `enableMapSet`
  from `immer`, which isn't a direct dependency under pnpm's strict layout.
  No Redux state holds a Map or Set, so the call is gone.
- **Deleted unrouted, out-of-scope template pages**: trading, investments,
  insurance, loans, budget/goals/savings/bills and the payments/online
  merchant catalogue (none were in the sidebar menu that generates routes;
  the UI PRD scopes them out), with their orphaned cards, slice and types.
  Also removed `zod`-based validation modules and a `parseFloat` money helper
  nothing imported, and an ambient `axios.d.ts` that shadowed axios's own types.
- **conversionClient type-checks**: the `VITE_USE_MOCK_API` mocks reuse the
  shared fixtures; the KYC error fallback reports zero limits; the WebSocket
  fallback no longer hits a TDZ error when the socket constructor throws.
- The send-money flow shares one `Recipient` type; ConvertHistory's loading
  state is wired; ConvertWallets shows a real relative "updated" time.

### Security — workflow trusted approver roles from the request body
- **Maker-checker decisions were authorised against `roles` the caller sent
  in the body**, so anyone holding `approvals:decide` could claim
  `treasury`/`compliance`/`admin` and satisfy any policy, payouts and closures
  included. Decider identity and roles now come only from the gateway's
  `X-User-Id`/`X-Roles` (set by auth-proxy, forwarded unchanged by bff).
- A body still carrying `roles` on propose/approve/reject is refused with
  `400 ROLES_NOT_ACCEPTED` rather than silently ignored: a client sending it
  believes the claim matters. Nothing on the platform sends it.
- Proposal and decision audit events (DENIED included) record the gateway
  roles the policy check actually used as `actor_roles`, beside the policy's
  `approverRoles`.
- kyc and compliance propose directly with a forwarded `X-User-Id`; that path
  relies on network isolation, which the README now says plainly.

### Added — P2's browser half: issue and redeem USD-X from the portal
- **bff routes for the saga.** `POST /wallets/usdx` opens the caller's USD-X
  wallet on a chain (idempotent; Solana still gets the platform custody
  account), `POST /issuances` and `POST /redemptions` forward to core-ledger
  and answer `202` with the journal entry plus a `correlationId`, and
  `GET /transfers/:correlationId` reports the saga in camelCase with
  `sourceTxUrl`/`destTxUrl` explorer links. Before this, no route between
  the browser and core-ledger's saga existed, so the P2 DoD's "issue from the
  browser, clickable Etherscan link" could not be performed.
- **bff checks that both wallets are the caller's** on issuance and
  redemption. core-ledger would post a perfectly balanced journal that debits
  one user's USD and mints to another user's address; the gateway only knows
  the caller holds `issuance:create`. A transfer belonging to someone else
  answers 404 unless the caller holds `transactions:read:any`.
- **core-ledger now sees who initiated it.** bff forwards the caller as
  `X-User-Id` on these writes, so `initiated_by` is the person rather than
  `api`.
- **Explorer links are server config** (`ETHEREUM_EXPLORER_TX_URL`,
  `SOLANA_EXPLORER_TX_URL`, defaulting to Sepolia Etherscan and Solana devnet),
  because the network a hash lives on is a property of the deployment, not
  something the browser should guess.
- **Portal.** A USD-X card on the wallet page (open a wallet → issue/redeem →
  poll the saga every 5s until terminal, showing retries and the linked hash),
  backed by a new `issuance` slice. auth-proxy's route table gains
  `POST /wallets/usdx`.
- Still to do: performing the browser DoD live against Sepolia.
### Fixed — compose containers dialling their own `localhost`
Each `.env.example` holds host-side addresses for `go run`/`pnpm start`; inside
a container `localhost` is the container itself. Four of them broke silently:
- **core-ledger worker `NATS_URL`** never connected, so outbox events
  accumulated unpublished. Compose now sets `nats://nats:4222` and waits for
  NATS (`WORKER_NATS_URL=` opts out).
- **`SIGNER_URL`** (core-ledger, worker, reconcile) and **`INDEXER_URL`**
  (worker) are opt-in features whose example values point at `localhost`.
  Compose now leaves them off unless `CORE_LEDGER_SIGNER_URL` /
  `WORKER_INDEXER_URL` say otherwise — remote signing additionally needs mTLS
  certs that compose doesn't mount yet.
- **notifications' WebSocket auth fetched Keycloak's keys from
  `localhost:8080`**, so no socket ever authenticated. New
  `KEYCLOAK_JWKS_URL` lets the keys come from `keycloak:8080` while `iss` is
  still checked against the browser-facing issuer.
- **notifications' identity lookup** fell back to the raw Keycloak subject,
  pushing to a party id no wallet carries. Compose points it at
  `host.docker.internal:3001`, where identity runs.
### Changed — services/kyc presigns with the AWS SDK
- **The hand-rolled SigV4 is gone.** Upload and download URLs are signed by
  `@aws-sdk/s3-request-presigner` 3.1166.0, pinned exactly. Behaviour is
  unchanged: path-style addressing (MinIO has no per-bucket DNS), the
  configured endpoint, region, bucket and expiry, and only `host` signed —
  the content type is still returned for the browser to send, not bound in.
- **The SDK's default would have broken uploads to S3.** It adds a CRC32 of
  an empty body to every presigned PUT; MinIO ignores it, S3 rejects every
  non-empty file against it. The client sets
  `requestChecksumCalculation: 'WHEN_REQUIRED'`, and the unit spec asserts no
  checksum parameter reaches the URL.
- **Storage is tested against a real backend for the first time.** A MinIO
  integration spec PUTs on a presigned URL, reads the bytes back on a
  presigned GET, and checks a wrong secret gets a 403. It skips unless
  `KYC_TEST_S3_ENDPOINT` is set, the same opt-in core-ledger's
  `LEDGER_TEST_DATABASE_URL` uses.
### Fixed — P6 signer: what the bytes are bound to
Branch `fix/p6-signer-binding`. The three items left open after the signer
started decoding what it signs.
- **The correlation id was not bound to the signed bytes.** Idempotency is
  keyed on the caller's correlation id; the chain's replay guard on the id
  *inside* the transaction. Unbound, an already-signed transaction presented
  under a fresh correlation id found no record and was signed again. Both
  chains carry `sha256(correlation_id)` (the `bytes32` on Ethereum, the
  `[u8; 32]` and processed-marker seed on Solana); the signer now requires the
  caller's id to hash to it, and refuses a bridge call that carries none.
- **A retry could never be re-signed.** Same correlation id with different
  bytes was refused outright — but a saga retry rebuilds its transaction, and
  on Solana a fresh blockhash alone changes the bytes, so a signed attempt
  that never landed dead-lettered its saga. Each correlation id is now bound to
  one **payload** (chain, method, contract/program, mint, amount, destination,
  on-chain id — no nonce, gas or blockhash): the same bytes replay the
  original signature, rebuilt bytes for the same payload are signed again, a
  different payload is `409 CORRELATION_REUSED`. Safe because the on-chain id
  is in the payload and now verified, so the chain's replay guard lets at most
  one land. Re-signs count once towards the daily limit. Migration `00002`
  adds `payload_digest`, widens the unique index to include the digest, and
  checks one-payload-per-correlation inside the SERIALIZABLE append so two
  replicas cannot both bind; rows from before it still verify and still accept
  only their exact bytes.
- **The Solana mint was not allowlisted.** `usdx_bridge` does not pin its
  mint, and anyone can create a mint whose authority is the program's PDA — a
  `bridge_mint` against one would spend the correlation id's processed marker
  on worthless tokens and block the real mint. The signer now refuses any mint
  but the configured one, and refuses an ATA create for any account but the
  one the bridge instruction touches (the relayer pays its rent).
- **Which contracts are ours moved from the policy file to deployment
  configuration**: `USDX_PROXY_ADDRESS`, `USDX_PROGRAM_ID`,
  `USDX_MINT_ADDRESS` — the names and values core-ledger already uses.
  Required and validated at boot outside `ENV=local` (the zero address the
  example policy shipped with is refused); a policy file still carrying
  `targets:` is refused at load rather than silently ignored. Documented in
  `services/signer/.env.example`; `infra/k8s/signer-deployment.yaml` reads
  them from a new `usdx-deployment` ConfigMap, left empty so an unfilled one
  stops the signer at boot.

### Notes
- **Not verified live.** Signer suite under `-race` against a real Postgres
  (`signer_test`), plus the audit suite run over a database first populated by
  `main`'s signer, to check the `00002` upgrade keeps old rows verifying.
- core-ledger is unchanged: it already derives both on-chain ids from the
  correlation id it passes, compensation (`<id>-compensation`) included. It
  still treats the signer's `409` as retryable, so a genuine payload conflict
  dead-letters after the attempt budget rather than compensating.
- Local development now needs `USDX_PROGRAM_ID`/`USDX_MINT_ADDRESS` (and
  `USDX_PROXY_ADDRESS` for Ethereum) in `services/signer/.env` for the signer
  to sign anything on that chain.
Branch `feat/p4-payment-outbox-fanout`. The two P4 follow-ups deferred from
the PR #17 review.

### Added — payment events can no longer be lost to a notifications outage
- **payments has a transactional outbox.** A settlement used to tell the
  customer with a best-effort POST made *after* the intent was marked, so if
  notifications was down at that moment the email and the toast were gone —
  the money had moved and nothing remembered that somebody still needed
  telling. `payment.settled`, `payment.failed` and `invoice.issued` are now
  rows in `outbox`, written in the same transaction as the status change they
  announce (migration `002_outbox.sql`).
  - The invoice a payment settles is now marked PAID inside that transaction
    too. Before, a crash between the two statements left an invoice OPEN
    behind a SETTLED intent.
  - `markFailed` only fires on a real transition. A rail repeating its
    failure callback, or a late failure for money that already landed, used
    to send the customer another "your payment failed".
- **`OutboxRelay`** delivers to notifications' `/internal/events`: kicked
  after each commit so the toast still arrives while the page is open, swept
  every `OUTBOX_RELAY_SECONDS`, backing off 1s → 5 min, `DEAD` after
  `OUTBOX_MAX_ATTEMPTS` (100, about eight hours) or at once on a 4xx that
  isn't 408/429. Rows are claimed `FOR UPDATE SKIP LOCKED`, so every replica
  runs one. An unset `NOTIFICATIONS_URL` queues rather than drops.
- **notifications dedupes webhook fan-out on the event id.** The delivery log
  was already UNIQUE on the producer's key, but the webhook queue behind it
  wasn't, so every outbox replay — routine for an at-least-once relay —
  queued another signed POST to every subscriber (migration
  `002_webhook_dedupe.sql`).

### Added — live pushes reach sockets on every notifications replica
- With `NATS_URL` set, every in-app push is published on core NATS and every
  replica (the publisher included) delivers it to its own sockets. With two
  replicas, a customer on A used to miss every push produced on B.
- **NATS, not Postgres `LISTEN/NOTIFY`.** NATS was already in compose and is
  the bus the plan names; core-ledger already publishes to it. `NOTIFY` would
  have avoided a client dependency, but caps a payload at 8000 bytes (so a
  large message means every replica re-reading the row from the database) and
  holds a dedicated connection per replica out of a pool sized for queries.
  Unlike the indexer's advisory lock, nothing here needs to live in the same
  database as the state it guards.
- **Core pub/sub on `live.notifications.push.v1`, deliberately outside
  `damp.>`.** core-ledger's DAMP stream captures `damp.>` with 30-day file
  retention, and JetStream stores plain publishes to any subject a stream
  covers — a push named `damp.notifications.*` would have kept every rendered
  message for a month. A push is a latency optimisation over `deliveries`, not
  a domain event.
- **Unset or unreachable NATS falls back to in-process delivery**, exactly
  the old behaviour. One replica (local dev) needs no broker; a broker outage
  costs cross-replica reach, not the service. NATS is not a readiness check
  for the same reason — pulling notifications out of rotation over a degraded
  toast would also stop email.
- compose sets `NATS_URL` for notifications so the path k8s relies on is the
  one exercised locally; k8s points at `nats.default.svc` (like Postgres and
  Keycloak, a backing service these manifests reference but don't deploy).
  CI's Node job gains a NATS service container.

### Fixed
- **payments could not boot.** `InvoicesController` injects `IntentsService`
  and `SettlementService`, which `IntentsModule` exports but doesn't make
  global, and `InvoicesModule` never imported it. Found by booting the real
  app for this change's smoke test; every earlier test constructed classes
  directly and never resolved the module graph.

### Notes
- **Verified:** payments' outbox suite and notifications' dedupe suite against
  real Postgres (`payments_test` / `notifications_test`), the fan-out suite
  against a real NATS, and an end-to-end run of the built apps — payments plus
  two notifications replicas sharing NATS: an invoice issued through replica
  A's ingest reached a WebSocket held by replica B; with A killed, the next
  invoice's event waited in the outbox and was delivered to B once A came
  back.
- A fanned-out push records `recipients: null` in its delivery row: each
  replica delivers to its own sockets and nobody counts the total.
- The NATS subject has no auth in front of it, the same trust model as
  `/internal/*`: anything that can reach the broker can push to a socket.
## 2026-11-12 — P7 follow-up: audit-trail producers

Branch `feat/p7-audit-producers`. Closes the P7 note that
`services/audit-trail` had no producers, with the delivery Qodo asked for:
**transactional** — an outbox per producer, written in the same database
transaction as the action it describes, relayed with retries, idempotent on
an event id.

### Added

- **`shared/go/platform/audit`** and **`@damp/nest-platform`'s audit module** —
  the same `audit_outbox` table, wire shape and rules in both languages.
  - `Enqueue` / `enqueueAuditEvent` take the caller's transaction handle and
    nothing else. An event committed separately from its action is evidence
    of something that may have rolled back, which is worse than no event.
  - The event id is minted at enqueue, so every redelivery carries the same
    one.
  - The relay claims with `FOR UPDATE SKIP LOCKED` (safe on every replica),
    backs off with full jitter, and has **no attempt budget for transient
    failures**: giving up because audit-trail was down for an afternoon would
    put a hole in the trail exactly where an outage was. Only a 4xx refusal
    is dead-lettered. `audit_outbox_pending_events` is the alarm.
  - Request id, forwarded source IP, user agent and `X-Roles` reach the event
    from a fiber middleware / `@AuditContext()` decorator.
- **Producers wired:** core-ledger (every journal posting incl. bridge legs,
  reversals, manual journals, wallet status changes, period closes,
  dead-letter resolutions — actor from `X-User-Id` via `actor()`; the worker
  runs the relay), workflow (proposals, each approval, rejections,
  cancellations, expiries), compliance (enforcement proposal → approval →
  execution, case assignment and closure, alert dismissal), kyc (review,
  approval with the tier change, rejection). Refused approvals — a
  self-approval, a digest or request-id mismatch — are recorded as `DENIED`.
- **audit-trail dedupes on `id`**: 201 first time, 200 with the original
  seq/hash on a redelivery, 409 for a different event under a recorded id.
  Recording can be gated on `INGEST_TOKEN`; producers send it as
  `AUDIT_TRAIL_TOKEN`.
- New env: `AUDIT_TRAIL_URL`, `AUDIT_TRAIL_TOKEN` (core-ledger worker,
  workflow, kyc, compliance), `INGEST_TOKEN` (audit-trail). Compose defaults
  them to a dev token; k8s reads Secret `audit-trail-ingest` (key `token`),
  which must be provided per deployment.

### Fixed — found by the first tests of audit-trail against real Postgres

- **Every read of an event failed.** `database/sql` can't scan `text[]` into
  `[]string`, so `Verify` — which gates boot — the event list and proofs all
  errored once a single event existed. The service would have refused to
  restart after its first recorded event.
- **An event with no `actor_roles` was a 500** (nil slice → `NULL` into a
  `NOT NULL` column).
- **`occurred_at` was hashed at nanosecond precision and stored at
  microsecond**, so on Linux every event would fail `Verify` on read-back.
  Both sides now truncate to microseconds before hashing.
- workflow's `decide()` said it ran "inside one transaction"; it ran separate
  queries. It now holds the request's row lock for the whole decision.
- core-ledger's `POST /wallets/:id/status` recorded no actor at all;
  compliance's case assignment didn't either.

### Notes

- **Not verified live.** Go suite under `-race` against real Postgres
  (bridge_test, signer_test, audit_trail_test), every Node workspace suite,
  workflow/kyc/compliance against their `*_test` databases. No relay has
  delivered to a running audit-trail container.
- There is still **no k8s manifest for audit-trail itself** (or reporting),
  though the P7 entry below says there is. The producers' manifests point at
  `audit-trail.default.svc.cluster.local:8085`.
- workflow's policy check still trusts the `roles` a decider puts in the
  request body. Not changed here; the audit event records those claimed
  roles beside the gateway's `X-Roles`, so a gap between them is visible.
- Not yet producers: identity (role grants), payments, rms, reporting,
  signer, indexer, notifications.

## 2026-11-09

### Fixed — CI, red on `main` in three of four jobs
- **Foundry never compiled.** `forge install` installed nothing: `lib/` is
  gitignored and there is no `.gitmodules`. New `make eth-deps` shallow-clones
  the tags `foundry.lock` pins and refuses a checkout at any other revision,
  since the bytecode must match what is live on Sepolia.
- **Anchor CLI wouldn't build.** `anchor-cli 1.2.0`'s locked dependencies
  need rustc 1.91; CI built it with the program's pinned 1.89.0. The CLI now
  gets its own toolchain; the program still builds on 1.89.0.
- **Node services couldn't resolve `@damp/nest-platform`**, whose `dist/` is
  gitignored and was never built in CI. CI and `make test-node` build the
  shared packages first.
- **Frontend lint had 69 `no-unused-vars` errors**, which the Node job would
  have hit next. Removed the unused names (no new `tsc` errors, 145 → 76) and
  deleted `src/examples/ConversionReduxExamples.tsx`, which nothing imported.

### Fixed — found by running P2's definition of done live (Sepolia)
- **Integration tests shared the dev database, and a real worker tried to
  execute what they left behind.** `make test-integration` pointed
  `LEDGER_TEST_DATABASE_URL` at `bridge`, the same database `make up-app`
  runs on, and the saga suites strand in-flight sagas on purpose. The first
  live worker boot swept 113 of them and submitted them to Sepolia; nothing
  landed only because the fixtures used `0xUSER` as an address and every
  `bridgeMint` reverted in gas estimation. Tests now get their own
  `bridge_test` database (`infra/postgres/init/02-ledger-test-db.sql` on a
  fresh volume; the Makefile creates it on an existing one).
- **Go integration packages corrupted each other's assertions.** `go test
  ./core-ledger/...` runs packages in parallel against one database, and
  several assert on how far a shared GL account (`2300.BRIDGE`) moved — so
  the suite failed intermittently. Both the Makefile and CI now pass `-p 1`.
- **`POST /wallets` validated nothing on chain.** An unknown chain
  (`ethereum` for `ETHEREUM`) reached the table's CHECK constraint and came
  back a 500; an unparseable Ethereum address was accepted, because
  go-ethereum's `HexToAddress` silently maps it to the zero address, and the
  wallet looked fine until its first mint reverted. `EnsureWallet` now
  rejects both with 400s (`UNKNOWN_CHAIN`, `INVALID_ADDRESS`).
- **Waiting for Sepolia finality spent the saga's attempt budget.** A chain
  client's finality wait lasts five minutes; Sepolia's finalized checkpoint
  trails the head by 13–19. Each timeout was charged as a failed attempt, so
  every healthy mint used three or four of its twelve on the way to
  `COMPLETED`. Chain clients now wrap `bridge.ErrNotFinal` when the
  transaction is included and succeeded but not yet final, and the worker
  gives that attempt back and rechecks in 15s. A missing receipt is still an
  ordinary timeout, so a dropped or reorged transaction still dead-letters.
- **docker-compose's API container listened on whatever `PORT` `.env` set**,
  away from the port its mapping and healthcheck assume. `PORT` is now pinned
  inside the container, and both host ports are overridable
  (`CORE_LEDGER_HOST_PORT`, `WORKER_HOST_PORT`) for hosts where 8081/8181 are
  taken.
- **The core-ledger container never reported healthy.** Its healthcheck hit
  `localhost`, which busybox `wget` resolves to `::1`; Fiber listens on IPv4
  only. It now targets `127.0.0.1`.

## 2026-09-29 — P7: reporting, audit trail & production readiness

Branch `feat/p7-reporting-audit`. The last phase, and the one whose job is to
make the previous six auditable.

### Added

- **`services/audit-trail`** — who did what, in a form that survives somebody
  with database access deciding they would rather it said something else. Not
  a log aggregator; Loki has the logs. This holds the events that are
  *evidence*.
  - **Two mechanisms, two questions.** The hash chain answers *"has anything
    been removed"*, to anyone who can read the table, with no trust in the
    process that wrote it. It cannot answer *"when was this written"* —
    somebody who controls the database can rewrite it from any point and
    produce a log that verifies perfectly. A Merkle root published externally
    answers that. Either alone leaves a gap the other closes.
  - **RFC 6962 domain separation**, and **an odd node is promoted, never
    duplicated** — CVE-2012-2459. Duplicating it makes a tree of *n* leaves
    collide with one where the last leaf genuinely appears twice, which for an
    audit trail means two histories under one anchor: the exact property an
    anchor exists to rule out. 13 tests, including that collision, the
    second-preimage case the domain separators prevent, and every leaf of
    every tree size up to 33 — the odd, non-power-of-two sizes are where the
    promotion path runs, and an hour's events are never a convenient size.
  - The proof endpoint returns **the algorithm alongside the proof**. An
    inclusion proof somebody cannot independently check is a claim, not a
    proof, and the details that matter are exactly the ones a verifier would
    guess wrong.
  - The default publisher writes roots to the service's own log and says so:
    *deliberately weak*, because a root in a log this platform controls proves
    nothing an attacker with that control could not also rewrite. With no
    publisher at all, roots are still computed and stored — an unpublished
    anchor is a weaker guarantee, not a lost one.
- **`services/reporting`** — definitions, runs, CSV, Superset tokens.
  - **It owns no numbers.** Every figure is read from the owning service at
    run time and *frozen* into the run. A trial balance regenerated on demand
    gives a different answer every time somebody opens it, which is useless as
    a record. The export serves the stored result and carries its SHA-256 in a
    header.
  - No query interface: report kinds are a fixed vocabulary. A reporting
    service that runs arbitrary SQL against other services' databases has
    bypassed every boundary this platform has.
  - **CSV formula injection is neutralised.** A field starting with `=`, `+`,
    `-` or `@` is prefixed, because a customer whose account name is
    `=HYPERLINK(...)` otherwise gets it executed in whoever opens the export —
    and account names and invoice descriptions are customer-supplied and both
    appear in reports.
- **SLOs** (`docs/slos.md`) — five, each with the PromQL, what it protects,
  and what it deliberately does *not* cover. 4xx is excluded from the
  money-movement objective, because counting a correctly-refused deposit as a
  failure would make the SLO improve whenever validation got weaker.
  services/signer gets no objective of its own: a signer that is down is
  already a saga that does not complete, and a signer-availability budget
  creates pressure to loosen the refusals that make it valuable.
- **The DR restore drill** (`docs/runbooks/dr-restore.md`) — written to be
  performed, quarterly, with the wall-clock per phase recorded, because an RTO
  nobody has measured is a number in a document. The indexer is deliberately
  *not* backed up: it rebuilds from the chains, and a restored stale cursor is
  worse than an empty one. Phase 4 is `make reconcile`, which is what says
  whether the restore is *correct* rather than merely complete.
- `audit:read` (32 permissions), both services in compose, k8s, Prometheus and
  the bff's forward list.

### Changed — the Superset hole

`frontend/src/services/supersetService.ts` called Superset's
`POST /api/v1/security/guest_token/` **from the browser**. That endpoint
requires a Superset **admin** bearer token, so either an admin credential was
being shipped to the browser or the call had never worked. The second is how
it survived: nothing rendered a dashboard, so nothing surfaced the failure.

- Tokens are now minted by services/reporting, where the credential lives.
- **Row-level security is the access control.** `rlsFor` issues no clause to a
  caller with an `:any` permission, a party-scoped clause to one with `:own`,
  and **refuses** a caller with neither — a missing clause is not a safe
  default, it is the absence of the control.
- The permissions come from the `X-Permissions` header auth-proxy set, never
  from a body field, which would be the caller naming its own access.
- **More aviation lineage removed:** `CREW_REPORTS`, `FLIGHT_REPORTS`,
  `MAINTENANCE_REPORTS` and `SAFETY_COMPLIANCE` dashboards, the
  three-environment URL-building map, and a `staticGuestToken` option — a
  bearer credential in a JS bundle. `supersetConfigManager.ts` (239 lines of
  diagnostics for config that no longer exists) deleted.

### Notes

- **Not verified live.** 146 Node tests, 35 Foundry, 19 Anchor, the full Go
  suite under `-race`. Nothing has talked to a real Superset instance, and no
  anchor has been published anywhere but a log.
- `services/audit-trail` has no *producers* yet. The recording endpoint works
  and is tested through the Merkle layer, but wiring every service to emit its
  own actor events is a change in nine services and belongs with each one's
  next substantive edit rather than as a mechanical sweep here.
- PDF export is not implemented — CSV is. A PDF renderer is a dependency with
  a font stack and a headless browser, and the reports that matter are
  consumed as data.

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
