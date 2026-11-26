import { Logger } from '@nestjs/common';
import { formatRate, RATE_SCALE, toScaled } from '../money/rate';
import { fetchJson } from './http';
import { PriceFeed, PriceObservation } from './price-feed';

const BASE_URL = 'https://api.kraken.com/0/public';

/**
 * Kraken's public ticker: one GET for all three pairs. Kraken is the
 * independent second crypto source — deliberately a different venue than
 * Coinbase, so the breaker's "two sources disagree" means two markets
 * disagree, not one venue read twice.
 *
 * Kraken's pair keys are decorated: every asset carries a class prefix
 * (X for crypto, Z for fiat) and a crypto base carries a second, pair-level
 * X — XBT/USD comes back as "XXBTZUSD". normalizePairKey() strips that
 * shape back to "BTC/USD", including Kraken's XBT→BTC rename.
 */
export class KrakenFeed implements PriceFeed {
  readonly name = 'kraken';
  readonly symbols = ['BTC/USD', 'ETH/USD', 'SOL/USD'];

  private readonly logger = new Logger(KrakenFeed.name);

  constructor(private readonly timeoutMs: number) {}

  async fetch(symbols: string[]): Promise<Map<string, PriceObservation>> {
    const wanted = symbols.filter((s) => this.symbols.includes(s));
    if (wanted.length === 0) return new Map();

    // BTC is XBT on Kraken; everything else keeps its code.
    const pairs = wanted.map((s) => s.replace('/', '').replace('BTC', 'XBT')).join(',');

    const data = (await fetchJson(`${BASE_URL}/Ticker?pair=${pairs}`, this.timeoutMs)) as {
      error?: string[];
      result?: Record<string, { a: [string, ...unknown[]]; b: [string, ...unknown[]] }>;
    };
    if (!data.result || (data.error && data.error.length > 0)) {
      throw new Error(`kraken ticker error: ${(data.error ?? ['no result']).join('; ')}`);
    }

    const out = new Map<string, PriceObservation>();
    for (const [key, ticker] of Object.entries(data.result)) {
      const symbol = normalizePairKey(key);
      if (!symbol || !wanted.includes(symbol)) continue;

      // a[0]/b[0] are the current ask and bid; the mid is their exact
      // average on scaled integers.
      const mid = formatRate((toScaled(ticker.a[0], RATE_SCALE) + toScaled(ticker.b[0], RATE_SCALE)) / 2n);
      out.set(symbol, { mid, at: new Date() });
    }

    for (const symbol of wanted) {
      if (!out.has(symbol)) {
        // A pair Kraken is momentarily not publishing is a missing source,
        // not a dead feed — the other feeds' observations still count, and
        // min-sources decides whether the symbol quotes.
        this.logger.warn(`kraken returned no data for ${symbol}`);
      }
    }
    return out;
  }
}

/**
 * "XXBTZUSD" -> "BTC/USD". Written for exactly the shapes this feed
 * requests (crypto base, fiat quote): split at the quote's Z prefix, strip
 * one class prefix from each half, then un-rename XBT. Anything else
 * returns null and is ignored rather than guessed at.
 */
function normalizePairKey(key: string): string | null {
  const z = key.indexOf('Z');
  if (z < 2) return null;
  let base = key.slice(0, z);
  let quote = key.slice(z);
  base = base.replace(/^X/, '');
  quote = quote.replace(/^Z/, '');
  if (!base || !quote) return null;
  if (base === 'XBT') base = 'BTC';
  return `${base}/${quote}`;
}
