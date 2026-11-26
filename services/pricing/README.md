# services/pricing

The **only issuer of FX quotes** on the platform. It prices
USD/EUR/GBP/KES/BTC/ETH/SOL from external feeds, refuses to quote anything
it cannot defend, and mints single-use quotes — pinned to one party and one
amount — in core-ledger through `POST /fx/quotes` under the `ledger.pricing`
role.

**The one thing it exists for:** every FX conversion and FX payment the
ledger executes consumes a quote, and a conversion is only as honest as the
quote it consumes. Before this service, `POST /fx/quotes` was reachable by
bff's user-proxy role — a caller could name its own rate. Now the only path
to a rate is this service, authenticated as `svc-pricing`, and the ledger
rejects anyone else (`ledger.pricing` is held by that one client).

## Running it

```bash
cp .env.example .env
pnpm --filter @damp/pricing start:dev
```

Needs its own Postgres database (`infra/postgres/init/07-pricing-database.sql`,
applied on a fresh volume — `docker compose down -v && make up`).

## Feeds

`PRICING_FEEDS` (comma-separated) picks the enabled feeds; an unknown name
fails at boot.

| feed | symbols | source |
|---|---|---|
| `coinbase` | BTC/USD, ETH/USD, SOL/USD | GET api.exchange.coinbase.com/products/{base}-USD/ticker; mid = (bid+ask)/2 |
| `kraken` | BTC/USD, ETH/USD, SOL/USD | GET api.kraken.com/0/public/Ticker; mid from b[0]/a[0]; handles the decorated pair keys (XXBTZUSD) and the XBT→BTC rename |
| `fiat` | USD/EUR, USD/GBP, USD/KES | `FIAT_FEED_URL` (default open.er-api.com/v6/latest/USD), a daily reference rate |
| `stub` | whatever `PRICING_STUB_RATES` JSON configures | fixed rates, fresh every poll — tests, e2e, and the offline local stack |

Every request carries an AbortController timeout (`PRICING_FEED_TIMEOUT_MS`).
Feeds never retry: a failed poll leaves the previous observation on file and
lets its age speak for itself. All rate arithmetic is BigInt fixed-point at
18 decimals (`src/money/rate.ts`) — no float ever touches a rate.

## Aggregation and the circuit breaker

The aggregator polls every enabled feed every `PRICING_POLL_MS` and keeps
the last observation per (feed, symbol). A quote is refused unless:

- **Crypto** (BTC/ETH/SOL side): at least `PRICING_MIN_SOURCES` (2) fresh
  observations (age ≤ `PRICING_MAX_AGE_MS`, 30s). The rate is the median.
- **Fiat**: `PRICING_FIAT_MIN_SOURCES` (1) fresh within
  `PRICING_FIAT_MAX_AGE_MS` (1h) — a daily reference rate is not stale at
  30 seconds.
- **Breaker**: if any two fresh sources deviate more than
  `PRICING_MAX_DEVIATION_BPS` (150), the symbol is **TRIPPED** — no quote is
  minted until a later poll finds them agreeing again. A disagreement that
  wide means one source is feeding garbage, and the median of garbage plus
  truth is still a wrong price. (Derived on every evaluation rather than
  stored: it is a pure function of the fresh observations, so it can never
  stick.)

Cross rates are computed through USD at full precision (BTC/KES =
BTC/USD × USD/KES), and an inverted leg divides once and truncates
**down — toward the house**, so the fractional minor unit stays in the FX
position rather than being invented for either side. `GET /rates` shows the
same mids with per-symbol status (`OK` / `STALE` / `TRIPPED`) and mints
nothing.

USD-X is never quoted: it is issued 1:1 against USD, the ledger rejects any
USD-X pair, and pricing refuses with `422 USDX_USES_ISSUANCE` before the
call is even made.

## Pinning and exposure

`POST /quotes` mints a quote pinned to **one amount** (`from_amount`) and
**one party** (`party_id`). The ledger enforces both pins at consumption
time (`QUOTE_AMOUNT_MISMATCH`, `QUOTE_PARTY_MISMATCH`) and allows exactly
one use — so a quote's exposure is bounded to this party moving this amount,
once.

On top of that, the exposure guard (`src/exposure/`) refuses to mint at all
when:

- the quote's USD notional exceeds the pair's `max_notional_usd`
  (`422 NOTIONAL_OVER_MAX`), or
- the party's outstanding quoted notional — the sum of unexpired, still
  consumable quotes plus in-flight reservations — would exceed
  `PRICING_PARTY_OUTSTANDING_USD` (`422 PARTY_OUTSTANDING_CAP_EXCEEDED`).

The cap is **outstanding**, not daily: the portal re-quotes every ~30s while
a user looks at a conversion screen, and an abandoned quote is never
consumed, so a rolling 24h window would let those abandoned quotes burn the
allowance. Daily/tiered spend limits belong to bff/KYC tiers, not here.

The guard is **reserve-first**: the cap check and a `RESERVED` row are
written in one transaction under a per-party advisory lock, so concurrent
requests from one party cannot all pass the cap. The row flips to `ISSUED`
(with the ledger's quote id) once the quote is minted, and is deleted if the
ledger call fails.

`RmsExposureGuard` is the slice-3 hook for the same question against rms's
reserve status — defined as an interface only, deliberately not implemented
yet.

The gross/fee/net numbers in the quote response are computed with the exact
integer arithmetic of core-ledger's `Convert()`
(`gross = amount·rate·10^toDec / (10^18·10^fromDec)`, truncated once;
`fee = gross·bps/10000`; `net = gross − fee`) and unit-tested for parity
against the ledger's own `fx_test.go` cases — a preview can never disagree
with the journal.

## Endpoints

All routes require a Keycloak service-account JWT with audience `pricing`
(H3, via `@damp/nest-platform`'s `ServiceAuthGuard`), carrying the client
role listed:

| | |
|---|---|
| `POST /quotes` | `pricing.quote` (svc-bff, svc-payments). Body `{from, to, amount, party_id}` → the pinned quote with gross/fee/net |
| `GET /rates?base=USD` | `pricing.read`. Indicative mids for every quotable currency vs base, with OK/STALE/TRIPPED per symbol |
| `GET /pairs` | `pricing.read`. The seeded pair policy (spread, TTL, enabled, max notional) |
| `PATCH /pairs/:base/:quote` | `pricing.admin` (svc-bff, ops console). Tune spread/TTL/enabled/max_notional — audited with the row it replaced |

`GET /healthz` and `/readyz` are unauthenticated platform probes.

## Database

`migrations/` runs at boot (same runner as rms):

- `pricing_pairs` — policy for every ordered pair among the seven quotable
  currencies (seeded: fiat↔fiat 50bps/300s, anything with crypto
  100bps/30s, max notional $10,000).
- `quotes_issued` — one row per requested quote, born `RESERVED` and flipped
  to `ISSUED` with the ledger's quote id; the exposure record the
  outstanding cap sums.
- `audit_outbox` — pair-policy changes, relayed to services/audit-trail.

## Tests

```bash
pnpm --filter @damp/pricing test
```

Feeds are tested against a fake `fetch` (no network). The e2e specs boot the
real app with a `FakeIssuer`; the audit-outbox spec uses the real
`pricing_test` database (`PRICING_TEST_DATABASE_URL`, same pattern as rms).
