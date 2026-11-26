import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PRICE_FEEDS } from '../feeds/feeds.module';
import { PriceFeed } from '../feeds/price-feed';
import {
  deviationBps,
  formatRate,
  inverseRate,
  isQuotable,
  mulRate,
  parseRate,
  RATE_SCALE,
} from '../money/rate';

/** A rate the aggregator is willing to stand behind, with its provenance. */
export interface RateResult {
  /** Fixed-point mid at RATE_SCALE: `rate / 10^18` quote per 1 base. */
  rate: bigint;
  /** The feeds whose fresh observations fed the median. */
  sources: string[];
  /** The oldest observation time behind the rate — freshness is the stalest leg's. */
  at: Date;
}

export type PriceStatus = 'OK' | 'STALE' | 'TRIPPED';

export interface SymbolStatus {
  currency: string;
  rate: string | null;
  status: PriceStatus;
  sources: string[];
  at: string | null;
}

/**
 * A typed refusal to quote, distinct from a crash: callers map the code to
 * an HTTP answer (STALE_PRICE / PAIR_TRIPPED -> 503, UNSUPPORTED_PAIR ->
 * 422) and the rates board maps it to a status.
 */
export class PricingRateError extends Error {
  constructor(
    readonly code: 'STALE_PRICE' | 'PAIR_TRIPPED' | 'UNSUPPORTED_PAIR',
    message: string,
  ) {
    super(message);
    this.name = 'PricingRateError';
  }
}

const CRYPTO = new Set(['BTC', 'ETH', 'SOL']);

interface Observation {
  mid: bigint;
  at: Date;
}

/**
 * The price engine: polls every enabled feed, keeps the last observation
 * per (feed, symbol), and refuses to quote anything it cannot defend.
 *
 * Rules, in order of refusal:
 *  - Crypto symbol: at least PRICING_MIN_SOURCES fresh observations (age <=
 *    PRICING_MAX_AGE_MS), median taken; if any two fresh sources deviate
 *    more than PRICING_MAX_DEVIATION_BPS the symbol is TRIPPED — a
 *    disagreement that wide means one source is feeding garbage, and the
 *    median of garbage plus truth is still a wrong price.
 *  - Fiat symbol: PRICING_FIAT_MIN_SOURCES (1) fresh within
 *    PRICING_FIAT_MAX_AGE_MS (1h) — a daily reference rate is not stale at
 *    30 seconds.
 *  - Cross rates (KES/BTC, EUR/BTC, ...) are computed through USD with
 *    fixed-point multiplication, and an inverse leg divides once and
 *    truncates down (toward the house). Both legs must pass their own
 *    rules; the combined rate is as fresh as its stalest leg.
 *
 * The tripped state is *derived* on every evaluation rather than persisted:
 * it is a pure function of the fresh observations, which only change on a
 * poll, so "tripped until they agree again" and "tripped exactly while
 * they disagree" are the same behavior without a stored flag that can
 * stick.
 */
@Injectable()
export class Aggregator implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Aggregator.name);
  private readonly observations = new Map<string, Map<string, Observation>>();
  private timer: NodeJS.Timeout | null = null;

  private readonly pollMs: number;
  private readonly minSources: number;
  private readonly maxAgeMs: number;
  private readonly maxDeviationBps: number;
  private readonly fiatMinSources: number;
  private readonly fiatMaxAgeMs: number;

  constructor(
    @Inject(PRICE_FEEDS) private readonly feeds: PriceFeed[],
    config: ConfigService,
  ) {
    this.pollMs = config.get<number>('PRICING_POLL_MS', { infer: true }) ?? 5000;
    this.minSources = config.get<number>('PRICING_MIN_SOURCES', { infer: true }) ?? 2;
    this.maxAgeMs = config.get<number>('PRICING_MAX_AGE_MS', { infer: true }) ?? 30000;
    this.maxDeviationBps = config.get<number>('PRICING_MAX_DEVIATION_BPS', { infer: true }) ?? 150;
    this.fiatMinSources = config.get<number>('PRICING_FIAT_MIN_SOURCES', { infer: true }) ?? 1;
    this.fiatMaxAgeMs = config.get<number>('PRICING_FIAT_MAX_AGE_MS', { infer: true }) ?? 3600000;
  }

  onModuleInit(): void {
    // Seed immediately: a fresh process should be quotable as soon as the
    // first data lands, not a poll interval later. The interval then keeps
    // observations fresh; a failed poll leaves the old ones on file and
    // lets their age speak for itself.
    void this.pollNow();
    this.timer = setInterval(() => void this.pollNow(), this.pollMs);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Polls every feed once. Exposed for tests; the interval calls it. */
  async pollNow(): Promise<void> {
    await Promise.all(
      this.feeds.map(async (feed) => {
        try {
          const fetched = await feed.fetch(feed.symbols);
          let bySymbol = this.observations.get(feed.name);
          if (!bySymbol) {
            bySymbol = new Map();
            this.observations.set(feed.name, bySymbol);
          }
          for (const [symbol, obs] of fetched) {
            bySymbol.set(symbol, { mid: parseRate(obs.mid), at: obs.at });
          }
        } catch (err) {
          // A dead feed is a reason the pair goes stale, not a reason to
          // crash the poller: the last good observation stays on file and
          // its age is what refuses quotes.
          this.logger.warn(`feed ${feed.name} poll failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );
  }

  /**
   * The rate for converting `from` into `to`, or a typed refusal.
   *
   * Every pair is reached through USD: direct legs come from the feeds'
   * own symbols, inverted legs divide once (truncating down, toward the
   * house), and a cross rate multiplies the two legs at full precision.
   */
  rateFor(from: string, to: string): RateResult {
    const base = from.toUpperCase();
    const quote = to.toUpperCase();

    if (base === 'USDX' || quote === 'USDX') {
      throw new PricingRateError(
        'UNSUPPORTED_PAIR',
        'USD-X is issued 1:1 against USD and is never quoted; route issuance instead',
      );
    }
    if (!isQuotable(base) || !isQuotable(quote) || base === quote) {
      throw new PricingRateError('UNSUPPORTED_PAIR', `${base}/${quote} is not a quotable pair`);
    }

    // The identity legs cost nothing and carry no freshness: quoting USD
    // against USD is refused above, but USD *through* USD is the peg every
    // cross rate is built on.
    const leg1 = base === 'USD' ? { rate: 10n ** BigInt(RATE_SCALE), sources: [], at: new Date() } : this.leg(base, 'USD');
    const leg2 = quote === 'USD' ? { rate: 10n ** BigInt(RATE_SCALE), sources: [], at: new Date() } : this.leg('USD', quote);

    const rate = base === 'USD' ? leg2.rate : quote === 'USD' ? leg1.rate : mulRate(leg1.rate, leg2.rate);
    const sources = [...new Set([...leg1.sources, ...leg2.sources])];
    return {
      rate,
      sources,
      // Conservative freshness: the combined rate is as fresh as its
      // stalest leg.
      at: leg1.at <= leg2.at ? leg1.at : leg2.at,
    };
  }

  /** The rates board: every quotable currency against `base`, with status. */
  statusesFor(base: string): { base: string; entries: SymbolStatus[] } {
    const normalized = base.toUpperCase();
    if (!isQuotable(normalized)) {
      throw new PricingRateError('UNSUPPORTED_PAIR', `${normalized} is not a quotable base currency`);
    }
    return {
      base: normalized,
      entries: (['USD', 'EUR', 'GBP', 'KES', 'BTC', 'ETH', 'SOL'] as const)
        .filter((currency) => currency !== normalized)
        .map((currency) => {
          try {
            const result = this.rateFor(normalized, currency);
            return {
              currency,
              rate: formatRate(result.rate),
              status: 'OK' as const,
              sources: result.sources,
              at: result.at.toISOString(),
            };
          } catch (err) {
            // UNSUPPORTED_PAIR cannot happen for the quotable set, but the
            // board must not crash a read endpoint — it reports what it
            // knows.
            const code = err instanceof PricingRateError ? err.code : 'STALE_PRICE';
            return {
              currency,
              rate: null,
              status: code === 'PAIR_TRIPPED' ? ('TRIPPED' as const) : ('STALE' as const),
              sources: [],
              at: null,
            };
          }
        }),
    };
  }

  /**
   * One leg of a cross rate: the a/b symbol when the feeds observe it
   * directly, else the inverse of b/a. A supported symbol with no
   * observations at all is STALE_PRICE, not UNSUPPORTED_PAIR — the pair
   * policy supports it, there is just no data for it yet.
   */
  private leg(a: string, b: string): RateResult {
    const direct = `${a}/${b}`;
    if (this.hasAnyObservation(direct)) return this.evaluateSymbol(direct);

    const inverse = `${b}/${a}`;
    if (this.hasAnyObservation(inverse)) {
      const inverted = this.evaluateSymbol(inverse);
      return { rate: inverseRate(inverted.rate), sources: inverted.sources, at: inverted.at };
    }

    throw new PricingRateError('STALE_PRICE', `${direct} has no observations yet`);
  }

  private hasAnyObservation(symbol: string): boolean {
    for (const bySymbol of this.observations.values()) {
      if (bySymbol.has(symbol)) return true;
    }
    return false;
  }

  /** The crypto/fiat rule split, the breaker, and the median — in that order. */
  private evaluateSymbol(symbol: string): RateResult {
    const crypto = symbol.split('/').some((side) => CRYPTO.has(side));
    const maxAge = crypto ? this.maxAgeMs : this.fiatMaxAgeMs;
    const minSources = crypto ? this.minSources : this.fiatMinSources;

    const now = Date.now();
    const fresh: Array<{ feed: string; mid: bigint; at: Date }> = [];
    for (const [feed, bySymbol] of this.observations) {
      const obs = bySymbol.get(symbol);
      if (obs && now - obs.at.getTime() <= maxAge) {
        fresh.push({ feed, mid: obs.mid, at: obs.at });
      }
    }

    if (fresh.length < minSources) {
      throw new PricingRateError(
        'STALE_PRICE',
        `${symbol} has ${fresh.length} fresh source(s), needs ${minSources} (feeds: ${[...this.observations.keys()].join(', ') || 'none'})`,
      );
    }

    // The circuit breaker, before the median: two sources disagreeing this
    // widely means one of them is wrong, and no aggregation of a wrong
    // number with a right one is safe to quote.
    const mids = fresh.map((o) => o.mid);
    for (let i = 0; i < mids.length; i++) {
      for (let j = i + 1; j < mids.length; j++) {
        if (deviationBps(mids[i], mids[j]) > BigInt(this.maxDeviationBps)) {
          throw new PricingRateError(
            'PAIR_TRIPPED',
            `${symbol} sources deviate more than ${this.maxDeviationBps} bps (${fresh
              .map((o) => `${o.feed}:${formatRate(o.mid)}`)
              .join(', ')})`,
          );
        }
      }
    }

    const sorted = [...mids].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    // Median; for an even count the mean of the two middles, truncated —
    // the honest center of the agreeing set.
    const n = sorted.length;
    const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2n;

    let oldest = fresh[0].at;
    for (const o of fresh) if (o.at < oldest) oldest = o.at;

    return { rate: median, sources: fresh.map((o) => o.feed), at: oldest };
  }
}
