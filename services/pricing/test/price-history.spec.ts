import { ConfigService } from '@nestjs/config';
import { PriceFeed, PriceObservation } from '../src/feeds/price-feed';
import { Aggregator } from '../src/rates/aggregator';
import {
  closestByBucket,
  downsample,
  formatChangePct,
  floorToMinute,
  PriceHistoryService,
  PricePointRow,
  PricePointsStore,
} from '../src/rates/price-history.service';
import { formatRate, parseRate } from '../src/money/rate';

/**
 * The price-history series, from the aggregator's write path through the
 * endpoint's read path: what gets recorded, how a series is ranged,
 * downsampled and converted into another base, and how the change
 * percentage is computed. No database — MemoryStore stands in for
 * PostgresPricePoints, and the conversion math is asserted with values
 * recomputed from the fixed-point rules rather than re-run by the helpers.
 */

class MemoryStore implements PricePointsStore {
  readonly bySymbol = new Map<string, PricePointRow[]>();

  async record(symbol: string, bucket: Date, mid: string, sources: string[]): Promise<void> {
    const list = this.bySymbol.get(symbol) ?? [];
    const idx = list.findIndex((r) => r.bucket.getTime() === bucket.getTime());
    const row: PricePointRow = { symbol, bucket, mid, sources };
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    this.bySymbol.set(symbol, list);
  }

  async rows(symbols: string[], start?: Date): Promise<PricePointRow[]> {
    return symbols
      .flatMap((symbol) => (this.bySymbol.get(symbol) ?? []).filter((r) => !start || r.bucket.getTime() >= start.getTime()))
      .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.bucket.getTime() - b.bucket.getTime());
  }

  async latestAndPrev(symbols: string[], cutoff: Date): Promise<Map<string, { latest: PricePointRow; prev: PricePointRow | null }>> {
    const out = new Map<string, { latest: PricePointRow; prev: PricePointRow | null }>();
    for (const symbol of symbols) {
      const rows = [...(this.bySymbol.get(symbol) ?? [])].sort((a, b) => a.bucket.getTime() - b.bucket.getTime());
      if (rows.length === 0) continue;
      const prev = [...rows].reverse().find((r) => r.bucket.getTime() <= cutoff.getTime()) ?? null;
      out.set(symbol, { latest: rows[rows.length - 1], prev });
    }
    return out;
  }

  async retain(): Promise<void> {
    // Retained only through the SQL in production; nothing to do here.
  }
}

class FakeFeed implements PriceFeed {
  readonly name: string;
  readonly symbols: string[];
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

function makeAggregator(feeds: PriceFeed[], history?: PriceHistoryService): Aggregator {
  const config = {
    get: (key: string) =>
      ({ PRICING_POLL_MS: 60000, PRICING_MIN_SOURCES: 2, PRICING_MAX_AGE_MS: 30000, PRICING_MAX_DEVIATION_BPS: 150, PRICING_FIAT_MIN_SOURCES: 1, PRICING_FIAT_MAX_AGE_MS: 3600000 })[key],
  } as unknown as ConfigService;
  return new Aggregator(feeds, config, history);
}

function answers(feed: FakeFeed, entries: Record<string, PriceObservation>): void {
  feed.next = async () => new Map(Object.entries(entries));
}

function row(symbol: string, bucket: Date, mid: string): PricePointRow {
  return { symbol, bucket, mid, sources: [] };
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60_000);

describe('recording after a poll', () => {
  it('upserts the aggregated mid for every OK symbol, keyed to the observation minute', async () => {
    const store = new MemoryStore();
    const history = new PriceHistoryService(store);
    const coinbase = new FakeFeed('coinbase', CRYPTO_SYMBOLS);
    const kraken = new FakeFeed('kraken', CRYPTO_SYMBOLS);
    const fiat = new FakeFeed('fiat', FIAT_SYMBOLS);
    answers(coinbase, { 'BTC/USD': obs('100000', 0), 'ETH/USD': obs('3500', 0), 'SOL/USD': obs('200', 0) });
    answers(kraken, { 'BTC/USD': obs('100010', 0), 'ETH/USD': obs('3500', 0), 'SOL/USD': obs('200', 0) });
    answers(fiat, { 'USD/KES': obs('129.5', 0) });
    const agg = makeAggregator([coinbase, kraken, fiat], history);
    await agg.pollNow();

    const btc = store.bySymbol.get('BTC/USD')!;
    expect(btc).toHaveLength(1);
    expect(btc[0].mid).toBe('100005'); // the median of 100000 and 100010
    expect(btc[0].sources).toEqual(['coinbase', 'kraken']);
    expect(btc[0].bucket.getTime()).toBe(floorToMinute(new Date()).getTime());

    expect(store.bySymbol.get('ETH/USD')![0].mid).toBe('3500');
    expect(store.bySymbol.get('SOL/USD')![0].mid).toBe('200');
    // The fiat symbol is its own recorded series (1 source is enough).
    expect(store.bySymbol.get('USD/KES')![0].mid).toBe('129.5');
  });

  it('a later poll in the same minute overwrites the bucket (last-write-wins)', async () => {
    const store = new MemoryStore();
    const history = new PriceHistoryService(store);
    const coinbase = new FakeFeed('coinbase', CRYPTO_SYMBOLS);
    const kraken = new FakeFeed('kraken', CRYPTO_SYMBOLS);
    const agg = makeAggregator([coinbase, kraken], history);

    answers(coinbase, { 'BTC/USD': obs('100000', 0) });
    answers(kraken, { 'BTC/USD': obs('100000', 0) });
    await agg.pollNow();
    answers(coinbase, { 'BTC/USD': obs('101000', 0) });
    answers(kraken, { 'BTC/USD': obs('101000', 0) });
    await agg.pollNow();

    const btc = store.bySymbol.get('BTC/USD')!;
    expect(btc).toHaveLength(1);
    expect(btc[0].mid).toBe('101000');
  });

  it('does not record a stale symbol, and records again once it recovers', async () => {
    const store = new MemoryStore();
    const history = new PriceHistoryService(store);
    const coinbase = new FakeFeed('coinbase', CRYPTO_SYMBOLS);
    const kraken = new FakeFeed('kraken', CRYPTO_SYMBOLS);
    const agg = makeAggregator([coinbase, kraken], history);

    // Two fresh sources: recorded.
    answers(coinbase, { 'BTC/USD': obs('100000', 0) });
    answers(kraken, { 'BTC/USD': obs('100000', 0) });
    await agg.pollNow();
    expect(store.bySymbol.get('BTC/USD')).toHaveLength(1);

    // Next poll kraken's observation has aged past the 30s window: stale,
    // and the poll must not write a point the quote path refuses.
    answers(coinbase, { 'BTC/USD': obs('100000', 0) });
    answers(kraken, { 'BTC/USD': obs('100000', 31_000) });
    await agg.pollNow();
    expect(store.bySymbol.get('BTC/USD')).toHaveLength(1);
    expect(store.bySymbol.get('BTC/USD')![0].mid).toBe('100000');

    // Fresh again: the recovered median overwrites this minute's bucket
    // (the two polls share a minute, so the row count stays one).
    answers(coinbase, { 'BTC/USD': obs('100000', 0) });
    answers(kraken, { 'BTC/USD': obs('100010', 0) });
    await agg.pollNow();
    expect(store.bySymbol.get('BTC/USD')).toHaveLength(1);
    expect(store.bySymbol.get('BTC/USD')![0].mid).toBe('100005');
  });

  it('does not record a tripped symbol', async () => {
    const store = new MemoryStore();
    const history = new PriceHistoryService(store);
    const coinbase = new FakeFeed('coinbase', CRYPTO_SYMBOLS);
    const kraken = new FakeFeed('kraken', CRYPTO_SYMBOLS);
    const agg = makeAggregator([coinbase, kraken], history);

    // 160 bps apart: the breaker refuses the median, so nothing is recorded.
    answers(coinbase, { 'BTC/USD': obs('100000', 0) });
    answers(kraken, { 'BTC/USD': obs('101600', 0) });
    await agg.pollNow();
    expect(store.bySymbol.has('BTC/USD')).toBe(false);

    // A symbol with no observations at all is skipped the same way.
    expect(store.bySymbol.has('SOL/USD')).toBe(false);
  });
});

describe('downsampling', () => {
  it('returns the series untouched when it already fits', () => {
    const points = [1, 2, 3];
    expect(downsample(points, 300)).toEqual(points);
  });

  it('keeps first and last and stays within the cap', () => {
    const points = Array.from({ length: 301 }, (_, i) => i);
    const sampled = downsample(points, 300);
    expect(sampled.length).toBeLessThanOrEqual(300);
    expect(sampled[0]).toBe(0);
    expect(sampled[sampled.length - 1]).toBe(300);
    // Evenly spread: adjacent picks never move backwards.
    for (let i = 1; i < sampled.length; i++) expect(sampled[i]).toBeGreaterThan(sampled[i - 1]);
  });
});

describe('range selection and validation', () => {
  async function seededHistory(): Promise<{ store: MemoryStore; history: PriceHistoryService }> {
    const store = new MemoryStore();
    const history = new PriceHistoryService(store);
    // A minute point an hour ago, a minute point an hour and a half ago,
    // and an old point 10 days back (which the 1D window must exclude).
    await store.record('BTC/USD', minutesAgo(60), '100000', []);
    await store.record('BTC/USD', minutesAgo(90), '99000', []);
    await store.record('BTC/USD', daysAgo(10), '50000', []);
    return { store, history };
  }

  it('keeps only the points inside the requested window', async () => {
    const { history } = await seededHistory();
    const result = await history.history(['BTC'], '1D', 'USD');
    expect(result.series[0].points).toHaveLength(2);
    // Ascending time: the 90-minute-old point first.
    expect(result.series[0].points[0].price).toBe('99000');
    expect(result.series[0].points[1].price).toBe('100000');
  });

  it('ALL keeps everything retention has kept', async () => {
    const { history } = await seededHistory();
    const result = await history.history(['BTC'], 'ALL', 'USD');
    expect(result.series[0].points).toHaveLength(3);
  });

  it('refuses an unknown range and an unchartable symbol', async () => {
    const { history } = await seededHistory();
    await expect(history.history(['BTC'], '6H', 'USD')).rejects.toMatchObject({
      response: { code: 'INVALID_RANGE' },
    });
    await expect(history.history(['USD'], '1D', 'USD')).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_PAIR' },
    });
    await expect(history.history(['BTC'], '1D', 'BTC')).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_PAIR' },
    });
  });
});

describe('base conversion through the USD legs', () => {
  it('converts a crypto series into a fiat base at each point\'s closest fiat rate', async () => {
    const store = new MemoryStore();
    const history = new PriceHistoryService(store);
    // BTC/USD minute points, and the daily USD/KES leg at two rates.
    await store.record('BTC/USD', minutesAgo(5), '100000', []);
    await store.record('BTC/USD', daysAgo(1.5), '100000', []);
    await store.record('USD/KES', minutesAgo(10), '129.5', []);
    await store.record('USD/KES', daysAgo(2), '130', []);

    const result = await history.history(['BTC'], 'ALL', 'KES');
    // The 5-minute-old point converts with the 10-minute-old fiat point
    // (129.5, the closest); the 1.5-day-old point converts with the
    // 2-day-old one (130, twelve hours away against ~35 hours for 129.5).
    expect(result.series[0].points).toHaveLength(2);
    expect(result.series[0].points[0].price).toBe('13000000'); // 100000 * 130
    expect(result.series[0].points[1].price).toBe('12950000'); // 100000 * 129.5
  });

  it('converts a fiat series into a crypto base with the inverse legs', async () => {
    const store = new MemoryStore();
    const history = new PriceHistoryService(store);
    await store.record('BTC/USD', minutesAgo(5), '100000', []);
    await store.record('USD/KES', minutesAgo(5), '129.5', []);

    const result = await history.history(['KES'], '1D', 'BTC');
    expect(result.series[0].points).toHaveLength(1);
    // 1 KES in BTC = (1/129.5) USD * (1/100000) BTC per USD, each inverse
    // truncated at 18dp and then multiplied at scale — spelled out here
    // with raw BigInt arithmetic rather than the helpers under test.
    const expected = ((10n ** 36n / parseRate('129.5')) * (10n ** 36n / parseRate('100000'))) / 10n ** 18n;
    expect(result.series[0].points[0].price).toBe(formatRate(expected));
  });

  it('leaves a USD-based series untouched and drops points with no base leg', async () => {
    const store = new MemoryStore();
    const history = new PriceHistoryService(store);
    await store.record('BTC/USD', minutesAgo(5), '100000', []);
    const inUsd = await history.history(['BTC'], '1D', 'USD');
    expect(inUsd.series[0].points).toEqual([{ t: expect.any(String), price: '100000' }]);

    // A EUR base with no USD/EUR rows anywhere: nothing to convert with.
    const inEur = await history.history(['BTC'], '1D', 'EUR');
    expect(inEur.series[0].points).toHaveLength(0);
    expect(inEur.series[0].change_pct).toBeNull();
  });

  it('inverts the fiat symbol\'s stored USD leg to a USD price', async () => {
    const store = new MemoryStore();
    const history = new PriceHistoryService(store);
    await store.record('USD/KES', minutesAgo(5), '129.5', []);
    const result = await history.history(['KES'], '1D', 'USD');
    // USD/KES = 129.5 KES per USD -> 1 KES is 1/129.5 USD.
    expect(result.series[0].points[0].price).toBe(formatRate(10n ** 36n / parseRate('129.5')));
  });
});

describe('change_pct', () => {
  it('is (last-first)/first*100 as an exactly-2-dp string, truncating toward zero', () => {
    expect(formatChangePct(parseRate('100'), parseRate('101'))).toBe('1.00');
    expect(formatChangePct(parseRate('100'), parseRate('99'))).toBe('-1.00');
    expect(formatChangePct(parseRate('100000'), parseRate('101250'))).toBe('1.25');
    expect(formatChangePct(parseRate('129.5'), parseRate('129.565'))).toBe('0.05'); // 0.05019...% -> 0.05
    expect(formatChangePct(0n, 5n)).toBeNull();
  });

  it('is computed over the returned points, and null for a single-point series', async () => {
    const store = new MemoryStore();
    const history = new PriceHistoryService(store);
    await store.record('BTC/USD', minutesAgo(10), '100000', []);
    await store.record('BTC/USD', minutesAgo(5), '101000', []);
    const result = await history.history(['BTC'], '1D', 'USD');
    expect(result.series[0].change_pct).toBe('1.00');

    await store.record('ETH/USD', minutesAgo(5), '3500', []);
    const single = await history.history(['ETH'], '1D', 'USD');
    expect(single.series[0].change_pct).toBeNull();
  });

  it('change24hMids returns the newest point and the newest at or before the cutoff', async () => {
    const store = new MemoryStore();
    const history = new PriceHistoryService(store);
    await store.record('BTC/USD', daysAgo(2), '90000', []);
    await store.record('BTC/USD', daysAgo(1), '95000', []);
    await store.record('BTC/USD', minutesAgo(5), '100000', []);
    const pairs = await history.change24hMids(['BTC/USD']);
    const pair = pairs.get('BTC/USD')!;
    expect(pair.latest.mid).toBe('100000');
    expect(pair.prev!.mid).toBe('95000'); // 2 days ago is past the 24h cutoff
  });
});

describe('closestByBucket', () => {
  it('picks the nearest row, preferring the earlier one on a tie', () => {
    const rows = [row('BTC/USD', minutesAgo(10), '1'), row('BTC/USD', minutesAgo(5), '2')];
    expect(closestByBucket(rows, minutesAgo(6).getTime())!.mid).toBe('2'); // 1 min away vs 4
    expect(closestByBucket(rows, minutesAgo(7.5).getTime())!.mid).toBe('1'); // exact tie -> earlier
    expect(closestByBucket(rows, minutesAgo(9).getTime())!.mid).toBe('1');
    expect(closestByBucket(rows, minutesAgo(1).getTime())!.mid).toBe('2');
    expect(closestByBucket(rows, minutesAgo(30).getTime())!.mid).toBe('1'); // before the first
    expect(closestByBucket([], Date.now())).toBeNull();
  });
});
