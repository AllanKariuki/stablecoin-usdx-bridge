import { ConfigService } from '@nestjs/config';
import { PriceFeed, PriceObservation } from '../src/feeds/price-feed';
import { Aggregator } from '../src/rates/aggregator';
import { formatRate, parseRate } from '../src/money/rate';

/**
 * Aggregation rules against programmable feeds — no timers, no network.
 * pollNow() is called by hand with observations at controlled ages, which
 * is exactly what the interval does in production.
 */

class FakeFeed implements PriceFeed {
  readonly name: string;
  readonly symbols: string[];
  /** The next poll's answer: symbol -> observation, or throw. */
  next: () => Promise<Map<string, PriceObservation>>;

  constructor(name: string, symbols: string[]) {
    this.name = name;
    this.symbols = symbols;
    this.next = async () => new Map();
  }

  fetch(): Promise<Map<string, PriceObservation>> {
    return this.next();
  }
}

const CRYPTO_SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD'];
const FIAT_SYMBOLS = ['USD/EUR', 'USD/GBP', 'USD/KES'];

function obs(mid: string, ageMs: number): PriceObservation {
  return { mid, at: new Date(Date.now() - ageMs) };
}

function makeAggregator(feeds: PriceFeed[], overrides: Record<string, unknown> = {}): Aggregator {
  const values: Record<string, unknown> = {
    PRICING_POLL_MS: 60000,
    PRICING_MIN_SOURCES: 2,
    PRICING_MAX_AGE_MS: 30000,
    PRICING_MAX_DEVIATION_BPS: 150,
    PRICING_FIAT_MIN_SOURCES: 1,
    PRICING_FIAT_MAX_AGE_MS: 3600000,
    ...overrides,
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new Aggregator(feeds, config);
}

function answers(feed: FakeFeed, entries: Record<string, PriceObservation>): void {
  feed.next = async () => new Map(Object.entries(entries));
}

describe('median and source counting', () => {
  it('takes the middle of three sources', async () => {
    const a = new FakeFeed('coinbase', CRYPTO_SYMBOLS);
    const b = new FakeFeed('kraken', CRYPTO_SYMBOLS);
    const c = new FakeFeed('exchange-c', CRYPTO_SYMBOLS);
    answers(a, { 'BTC/USD': obs('100000', 0) });
    answers(b, { 'BTC/USD': obs('100030', 0) });
    answers(c, { 'BTC/USD': obs('100010', 0) });
    const agg = makeAggregator([a, b, c]);
    await agg.pollNow();

    const result = agg.rateFor('BTC', 'USD');
    expect(formatRate(result.rate)).toBe('100010');
    expect(result.sources).toEqual(['coinbase', 'kraken', 'exchange-c']);
  });

  it('means the two middles when the count is even', async () => {
    const a = new FakeFeed('coinbase', CRYPTO_SYMBOLS);
    const b = new FakeFeed('kraken', CRYPTO_SYMBOLS);
    answers(a, { 'BTC/USD': obs('100000', 0) });
    answers(b, { 'BTC/USD': obs('100010', 0) });
    const agg = makeAggregator([a, b]);
    await agg.pollNow();

    expect(formatRate(agg.rateFor('BTC', 'USD').rate)).toBe('100005');
  });

  it('refuses a crypto symbol with fewer than the minimum sources', async () => {
    const a = new FakeFeed('coinbase', CRYPTO_SYMBOLS);
    const b = new FakeFeed('kraken', CRYPTO_SYMBOLS);
    answers(a, { 'BTC/USD': obs('100000', 0) });
    // kraken has nothing this poll.
    const agg = makeAggregator([a, b]);
    await agg.pollNow();

    expect(() => agg.rateFor('BTC', 'USD')).toThrow(expect.objectContaining({ code: 'STALE_PRICE' }));
  });

  it('a failed poll leaves the previous observation on file', async () => {
    const a = new FakeFeed('coinbase', CRYPTO_SYMBOLS);
    const b = new FakeFeed('kraken', CRYPTO_SYMBOLS);
    answers(a, { 'BTC/USD': obs('100000', 0) });
    answers(b, { 'BTC/USD': obs('100010', 0) });
    const agg = makeAggregator([a, b]);
    await agg.pollNow();

    // Next poll: coinbase dies. The last observation stays and stays fresh.
    a.next = async () => {
      throw new Error('connection refused');
    };
    answers(b, { 'BTC/USD': obs('100010', 1000) });
    await agg.pollNow();

    expect(formatRate(agg.rateFor('BTC', 'USD').rate)).toBe('100005');
  });
});

describe('staleness', () => {
  it('an observation older than the crypto window is stale', async () => {
    const a = new FakeFeed('coinbase', CRYPTO_SYMBOLS);
    const b = new FakeFeed('kraken', CRYPTO_SYMBOLS);
    answers(a, { 'BTC/USD': obs('100000', 31_000) });
    answers(b, { 'BTC/USD': obs('100010', 0) });
    const agg = makeAggregator([a, b]);
    await agg.pollNow();

    expect(() => agg.rateFor('BTC', 'USD')).toThrow(expect.objectContaining({ code: 'STALE_PRICE' }));
  });

  it('fiat stays fresh for an hour and stales after', async () => {
    const fiat = new FakeFeed('fiat', FIAT_SYMBOLS);
    const agg = makeAggregator([fiat]);

    answers(fiat, { 'USD/KES': obs('129.5', 30 * 60_000) });
    await agg.pollNow();
    expect(formatRate(agg.rateFor('USD', 'KES').rate)).toBe('129.5');

    answers(fiat, { 'USD/KES': obs('129.5', 61 * 60_000) });
    await agg.pollNow();
    expect(() => agg.rateFor('USD', 'KES')).toThrow(expect.objectContaining({ code: 'STALE_PRICE' }));
  });
});

describe('the deviation circuit breaker', () => {
  it('trips when any two sources disagree beyond the limit, and untrips when they agree again', async () => {
    const a = new FakeFeed('coinbase', CRYPTO_SYMBOLS);
    const b = new FakeFeed('kraken', CRYPTO_SYMBOLS);
    const agg = makeAggregator([a, b]); // 150 bps limit

    // 160 bps apart: tripped, even though two sources are "fresh".
    answers(a, { 'BTC/USD': obs('100000', 0) });
    answers(b, { 'BTC/USD': obs('101600', 0) });
    await agg.pollNow();
    expect(() => agg.rateFor('BTC', 'USD')).toThrow(expect.objectContaining({ code: 'PAIR_TRIPPED' }));

    // Next poll they agree: quotes flow again. The trip is derived from the
    // observations, so agreeing data untrips on its own.
    answers(a, { 'BTC/USD': obs('100000', 0) });
    answers(b, { 'BTC/USD': obs('100010', 0) });
    await agg.pollNow();
    expect(formatRate(agg.rateFor('BTC', 'USD').rate)).toBe('100005');
  });

  it('trips on the disagreeing pair even when a third source agrees', async () => {
    const a = new FakeFeed('coinbase', CRYPTO_SYMBOLS);
    const b = new FakeFeed('kraken', CRYPTO_SYMBOLS);
    const c = new FakeFeed('exchange-c', CRYPTO_SYMBOLS);
    answers(a, { 'BTC/USD': obs('100000', 0) });
    answers(b, { 'BTC/USD': obs('101600', 0) });
    answers(c, { 'BTC/USD': obs('100000', 0) });
    const agg = makeAggregator([a, b, c]);
    await agg.pollNow();

    // A median of three "mostly agreeing" sources would be 100000 — but one
    // of them is 160bps away, which means garbage in, so nothing quotes.
    expect(() => agg.rateFor('BTC', 'USD')).toThrow(expect.objectContaining({ code: 'PAIR_TRIPPED' }));
  });
});

describe('cross rates through USD', () => {
  function seeded(): Aggregator {
    const coinbase = new FakeFeed('coinbase', CRYPTO_SYMBOLS);
    const kraken = new FakeFeed('kraken', CRYPTO_SYMBOLS);
    const fiat = new FakeFeed('fiat', FIAT_SYMBOLS);
    answers(coinbase, { 'BTC/USD': obs('100000', 0) });
    answers(kraken, { 'BTC/USD': obs('100000', 0) });
    answers(fiat, { 'USD/KES': obs('129.5', 0) });
    return makeAggregator([coinbase, kraken, fiat]);
  }

  it('BTC/KES = BTC/USD * USD/KES, sources from both legs', async () => {
    const agg = seeded();
    await agg.pollNow();

    const result = agg.rateFor('BTC', 'KES');
    expect(formatRate(result.rate)).toBe('12950000');
    expect(result.sources).toEqual(['coinbase', 'kraken', 'fiat']);
  });

  it('KES/BTC composes the two inverses to the exact single inverse', async () => {
    const agg = seeded();
    await agg.pollNow();

    // KES/BTC = (1/(USD/KES)) * (1/(BTC/USD)) = 1/12,950,000, truncated
    // down at each division — the exact floor of the single inverse.
    expect(formatRate(agg.rateFor('KES', 'BTC').rate)).toBe('0.00000007722007722');
  });

  it('USD/BTC is the exact inverse of BTC/USD', async () => {
    const agg = seeded();
    await agg.pollNow();

    expect(formatRate(agg.rateFor('USD', 'BTC').rate)).toBe('0.00001');
  });

  it('refuses USD-X, identity and unknown pairs', async () => {
    const agg = seeded();
    await agg.pollNow();

    expect(() => agg.rateFor('USDX', 'USD')).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_PAIR' }));
    expect(() => agg.rateFor('USD', 'USD')).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_PAIR' }));
    expect(() => agg.rateFor('XXX', 'USD')).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_PAIR' }));
  });

  it('a supported pair with no observations is stale, not unsupported', async () => {
    const agg = seeded();
    await agg.pollNow();

    // No feed observes SOL/USD here.
    expect(() => agg.rateFor('SOL', 'USD')).toThrow(expect.objectContaining({ code: 'STALE_PRICE' }));
  });
});

describe('the rates board', () => {
  it('reports OK, STALE and TRIPPED per symbol without throwing', async () => {
    const coinbase = new FakeFeed('coinbase', CRYPTO_SYMBOLS);
    const kraken = new FakeFeed('kraken', CRYPTO_SYMBOLS);
    const fiat = new FakeFeed('fiat', FIAT_SYMBOLS);
    answers(coinbase, { 'BTC/USD': obs('100000', 0) });
    answers(kraken, { 'BTC/USD': obs('101600', 0) }); // BTC/USD: TRIPPED
    answers(fiat, { 'USD/KES': obs('129.5', 0) }); // SOL/USD: no data -> STALE
    const agg = makeAggregator([coinbase, kraken, fiat]);
    await agg.pollNow();

    const board = agg.statusesFor('USD');
    expect(board.base).toBe('USD');
    const byCurrency = new Map(board.entries.map((e) => [e.currency, e]));

    expect(byCurrency.get('BTC')).toMatchObject({ status: 'TRIPPED', rate: null });
    expect(byCurrency.get('SOL')).toMatchObject({ status: 'STALE', rate: null });
    expect(byCurrency.get('KES')).toMatchObject({ status: 'OK', rate: '129.5' });
    expect(byCurrency.has('USDX')).toBe(false);
    expect(byCurrency.has('USD')).toBe(false);
  });
});

// A spot re-derivation for the KES/BTC exact case, kept separate from the
// implementation's own helpers so the test does not just re-run the code.
describe('KES/BTC exact value', () => {
  it('is 1/12,950,000 truncated at 18 decimals', () => {
    const one = 10n ** 36n;
    const btcKes = parseRate('12950000');
    expect(formatRate(one / btcKes)).toBe('0.00000007722007722');
  });
});
