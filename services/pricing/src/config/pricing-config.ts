import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, IsUrl, Matches, Max, Min } from 'class-validator';

/**
 * pricing's environment surface. Field names double as the env var names —
 * @damp/nest-platform's PlatformConfigModule reads process.env straight
 * into these and collects every missing/invalid one into a single error at
 * boot (mirrors services/rms/src/config/rms-config.ts).
 */
export class PricingConfig {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3006; // per docs/building-plan.md's port map: identity 3001, bff 3002, payments 3003, compliance 3004, rms 3005, pricing 3006

  @IsString()
  @IsIn(['debug', 'info', 'warn', 'error'])
  LOG_LEVEL = 'info';

  // pricing's own Postgres database — see migrations/ and
  // infra/postgres/init/07-pricing-database.sql.
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // The one service pricing writes to: POST /fx/quotes, under the
  // ledger.pricing role only this service holds.
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  CORE_LEDGER_URL!: string;

  // --- rms. POST /exposure/check bounds every crypto-legged quote against
  // the house's current exposure before a rate is minted; the guard fails
  // closed when it is unreachable (503 RMS_UNAVAILABLE), because quoting
  // past a limit you cannot see is the risk the limit exists to prevent.
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  RMS_URL!: string;

  // --- Service-to-service auth (H2). Every core-ledger call carries
  // pricing's own service-account token; core-ledger verifies it and checks
  // ledger.pricing.
  @IsString()
  @IsNotEmpty()
  SERVICE_CLIENT_ID!: string;

  @IsString()
  @IsNotEmpty()
  SERVICE_CLIENT_SECRET!: string;

  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  KEYCLOAK_BASE_URL!: string;

  @IsString()
  KEYCLOAK_REALM = 'damp';

  // --- Inbound service-to-service auth (H3). Every request must carry a
  // service-account JWT whose audience is the `pricing` resource client.
  // Both required — there is no unauthenticated mode.
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  AUTH_ISSUER_URL!: string;

  @IsString()
  @IsNotEmpty()
  AUTH_AUDIENCE = 'pricing';

  // services/audit-trail's base URL. The audit relay drains audit_outbox to
  // its POST /internal/events; empty means events wait, durably, until set.
  @IsString()
  AUDIT_TRAIL_URL = '';

  // Bearer token audit-trail's INGEST_TOKEN expects.
  @IsString()
  AUDIT_TRAIL_TOKEN = '';

  // --- Feeds. Comma-separated names of the enabled PriceFeeds. "stub" keeps
  // the whole stack offline for local dev; production runs coinbase+kraken
  // for crypto and fiat for the USD legs. An unknown name fails at boot.
  @IsString()
  PRICING_FEEDS = 'coinbase,kraken,fiat';

  // StubFeed's fixed rates: a JSON object of "BTC/USD": "100000.00"-shaped
  // decimal strings. Only read when "stub" is in PRICING_FEEDS.
  @IsString()
  PRICING_STUB_RATES = '';

  /**
   * How often every enabled feed is polled. One poll replaces the previous
   * observation per (feed, symbol); a failed poll leaves the old one on
   * file and lets its age speak for itself.
   */
  @Type(() => Number)
  @IsInt()
  @Min(100)
  PRICING_POLL_MS = 5000;

  // --- Crypto aggregation. A crypto symbol needs this many fresh sources
  // before it can be quoted, and a source is fresh while its observation is
  // younger than PRICING_MAX_AGE_MS.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  PRICING_MIN_SOURCES = 2;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PRICING_MAX_AGE_MS = 30000;

  /**
   * The circuit breaker: when any two fresh sources disagree by more than
   * this many basis points, the symbol is TRIPPED and no quote is minted
   * until a later poll finds them agreeing again. A disagreement this wide
   * means one feed is feeding garbage, and the median of garbage plus truth
   * is still a wrong price.
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  PRICING_MAX_DEVIATION_BPS = 150;

  // --- Fiat aggregation, deliberately looser: the open.er-api.com feed is
  // a daily-refreshed reference rate, so one source is enough and an hour
  // of age is fresh. The 150bps breaker still applies when two sources are
  // configured.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  PRICING_FIAT_MIN_SOURCES = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PRICING_FIAT_MAX_AGE_MS = 3600000;

  /**
   * The per-party OUTSTANDING notional ceiling in USD (decimal string), on
   * top of each pair's own max_notional_usd: the sum of the party's
   * unexpired (still consumable) quotes plus in-flight reservations. The
   * portal re-quotes every ~30s while a user looks at a conversion screen,
   * so a rolling 24h window would let abandoned quotes burn the allowance —
   * only quotes that can still be consumed are exposure. Daily/tiered spend
   * limits are a bff/KYC-tier concern and deliberately do NOT live here.
   */
  @Matches(/^\d+(\.\d+)?$/)
  PRICING_PARTY_OUTSTANDING_USD = '25000';

  // Hard timeout for one feed HTTP call. Feeds don't retry — the next poll
  // replaces the observation — so a slow feed is a stale price, never a
  // hung poller.
  @Type(() => Number)
  @IsInt()
  @Min(100)
  PRICING_FEED_TIMEOUT_MS = 5000;

  // FiatFeed's base URL: any er-api-shaped GET returning
  // {"result":"success","rates":{"EUR":...}} with rates denominated in USD.
  @IsUrl({ require_tld: true })
  FIAT_FEED_URL = 'https://open.er-api.com/v6/latest/USD';
}
