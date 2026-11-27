import { formatRate, parseRate } from '../money/rate';
import { PriceFeed, PriceObservation } from './price-feed';

/**
 * Fixed rates for tests, e2e and the offline local stack. PRICING_STUB_RATES
 * is a JSON object of "BTC/USD": "100000.00"-shaped decimal strings; the
 * feed reports every configured symbol it is asked for, fresh at every
 * poll, so nothing in a stub-only environment ever goes stale.
 *
 * The stub is also the one fake that makes a breaker demo possible without
 * two real venues: point two stub instances (or a stub plus a hand-edited
 * JSON) at disagreeing rates and watch the pair trip.
 */
export class StubFeed implements PriceFeed {
  readonly name = 'stub';
  readonly symbols: string[];

  private readonly rates: Map<string, string>;

  constructor(ratesJson: string) {
    // Parse at construction so a malformed PRICING_STUB_RATES fails at
    // boot, in the config error, rather than on the first poll.
    const parsed = JSON.parse(ratesJson || '{}') as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('PRICING_STUB_RATES must be a JSON object of "SYMBOL": "rate" strings');
    }
    this.rates = new Map(
      Object.entries(parsed as Record<string, unknown>).map(([symbol, rate]) => {
        if (typeof rate !== 'string') {
          throw new Error(`PRICING_STUB_RATES["${symbol}"] must be a decimal string`);
        }
        // Validates the decimal and its scale now, once, and stores the
        // normalized form every other feed produces.
        return [symbol, formatRate(parseRate(rate))];
      }),
    );
    this.symbols = [...this.rates.keys()];
  }

  async fetch(symbols: string[]): Promise<Map<string, PriceObservation>> {
    const at = new Date();
    const out = new Map<string, PriceObservation>();
    for (const symbol of symbols) {
      const rate = this.rates.get(symbol);
      if (rate !== undefined) out.set(symbol, { mid: rate, at });
    }
    return out;
  }
}
