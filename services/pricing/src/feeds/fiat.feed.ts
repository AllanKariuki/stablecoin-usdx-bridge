import { Logger } from '@nestjs/common';
import { formatRate, parseRate } from '../money/rate';
import { fetchJson } from './http';
import { PriceFeed, PriceObservation } from './price-feed';

/**
 * Fiat reference rates from an er-api-shaped endpoint
 * (https://open.er-api.com/v6/latest/USD): {"result":"success","rates":
 * {"EUR":0.92,"GBP":0.79,"KES":129.5},...} where rates[X] is how many X one
 * USD buys — i.e. the USD/X rate the aggregator wants directly.
 *
 * The rates arrive as JSON numbers, which are floats. Going through
 * String() gives the shortest round-trip decimal of the float; the error
 * that remains is bounded by float precision (~1e-15 relative), which is
 * far below the 150bps breaker this service refuses to quote past — and
 * it is the only shape the API offers. Crypto feeds send strings and take
 * the full 18 decimals.
 */
export class FiatFeed implements PriceFeed {
  readonly name = 'fiat';
  readonly symbols = ['USD/EUR', 'USD/GBP', 'USD/KES'];

  private readonly logger = new Logger(FiatFeed.name);

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async fetch(symbols: string[]): Promise<Map<string, PriceObservation>> {
    const wanted = symbols.filter((s) => this.symbols.includes(s));
    if (wanted.length === 0) return new Map();

    const data = (await fetchJson(this.baseUrl, this.timeoutMs)) as {
      result?: string;
      rates?: Record<string, number>;
      time_last_update_unix?: number;
    };
    if (data.result !== 'success' || !data.rates) {
      throw new Error(`fiat feed ${this.baseUrl} answered ${data.result ?? 'no result'}`);
    }

    // The reference rate's own timestamp, in seconds since epoch; a stale
    // one is exactly what the aggregator's one-hour fiat window catches.
    const at = new Date((data.time_last_update_unix ?? Date.now() / 1000) * 1000);

    const out = new Map<string, PriceObservation>();
    for (const symbol of wanted) {
      const quote = symbol.split('/')[1];
      const rate = data.rates[quote];
      if (typeof rate !== 'number' || !isFinite(rate) || rate <= 0) {
        this.logger.warn(`fiat feed has no ${quote} rate`);
        continue;
      }
      // parseRate validates and scales; formatRate renders the normalized
      // decimal back — the aggregator re-parses whatever string it gets,
      // so this must stay a decimal string, never a scaled integer.
      out.set(symbol, { mid: formatRate(parseRate(String(rate))), at });
    }
    return out;
  }
}
