import { formatRate, RATE_SCALE, toScaled } from '../money/rate';
import { fetchJson } from './http';
import { PriceFeed, PriceObservation } from './price-feed';

const BASE_URL = 'https://api.exchange.coinbase.com';

/**
 * Coinbase's free, self-service exchange ticker: GET
 * /products/{base}-USD/ticker answers {bid, ask, time} per request, so one
 * request per symbol. The mid is (bid + ask) / 2 computed on scaled
 * integers — averaging in floats would introduce exactly the 1e-17 noise
 * this service exists to keep out of rates.
 */
export class CoinbaseFeed implements PriceFeed {
  readonly name = 'coinbase';
  readonly symbols = ['BTC/USD', 'ETH/USD', 'SOL/USD'];

  constructor(private readonly timeoutMs: number) {}

  async fetch(symbols: string[]): Promise<Map<string, PriceObservation>> {
    const wanted = symbols.filter((s) => this.symbols.includes(s));
    const out = new Map<string, PriceObservation>();

    await Promise.all(
      wanted.map(async (symbol) => {
        const base = symbol.split('/')[0];
        const ticker = (await fetchJson(`${BASE_URL}/products/${base}-USD/ticker`, this.timeoutMs)) as {
          bid: string;
          ask: string;
          time?: string;
        };
        if (typeof ticker.bid !== 'string' || typeof ticker.ask !== 'string') {
          throw new Error(`coinbase ticker for ${base} has no bid/ask`);
        }
        const mid = formatRate((toScaled(ticker.bid, RATE_SCALE) + toScaled(ticker.ask, RATE_SCALE)) / 2n);
        out.set(symbol, { mid, at: new Date(ticker.time ?? Date.now()) });
      }),
    );

    return out;
  }
}
