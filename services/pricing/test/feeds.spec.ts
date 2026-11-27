import { CoinbaseFeed } from '../src/feeds/coinbase.feed';
import { FiatFeed } from '../src/feeds/fiat.feed';
import { KrakenFeed } from '../src/feeds/kraken.feed';
import { StubFeed } from '../src/feeds/stub.feed';

/**
 * Feed parsing against a fake global fetch — no network. Each feed's job is
 * turning one provider's wire shape into the shared PriceObservation shape;
 * the mid must be exact ((bid+ask)/2 on scaled integers), and the
 * timestamp must be the feed's own.
 */

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
});

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): jest.Mock {
  const fn = jest.fn((url: string, init?: RequestInit) => handler(String(url), init));
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('CoinbaseFeed', () => {
  it('averages bid and ask exactly and carries the feed timestamp', async () => {
    const feed = new CoinbaseFeed(5000);
    const fn = mockFetch(async (url) => {
      if (url.includes('/products/BTC-USD/ticker')) {
        return jsonResponse({ bid: '96700.10', ask: '96700.14', time: '2026-11-26T10:00:00.123Z' });
      }
      if (url.includes('/products/ETH-USD/ticker')) {
        return jsonResponse({ bid: '3499.8', ask: '3500.2' });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const out = await feed.fetch(['BTC/USD', 'ETH/USD']);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(out.get('BTC/USD')).toEqual({ mid: '96700.12', at: new Date('2026-11-26T10:00:00.123Z') });
    expect(out.get('ETH/USD')).toEqual({ mid: '3500', at: expect.any(Date) });
  });

  it('requests every ticker with an abort signal', async () => {
    const feed = new CoinbaseFeed(5000);
    mockFetch(async () => jsonResponse({ bid: '1', ask: '1.02' }));

    await feed.fetch(['BTC/USD']);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('ignores symbols outside its scope', async () => {
    const feed = new CoinbaseFeed(5000);
    const fn = mockFetch(async () => jsonResponse({ bid: '1', ask: '1.02' }));

    const out = await feed.fetch(['USD/KES', 'BTC/USD']);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(out.has('USD/KES')).toBe(false);
    expect(out.has('BTC/USD')).toBe(true);
  });
});

describe('KrakenFeed', () => {
  it('handles the decorated pair keys and the XBT rename', async () => {
    const feed = new KrakenFeed(5000);
    mockFetch(async (url) => {
      expect(url).toContain('pair=XBTUSD,ETHUSD');
      return jsonResponse({
        error: [],
        result: {
          XXBTZUSD: { a: ['100001.1', '1', '1'], b: ['99999.9', '1', '1'] },
          XETHZUSD: { a: ['3500.2', '1', '1'], b: ['3499.8', '1', '1'] },
          // A pair we did not ask for must be ignored, not mapped.
          XSOLZUSD: { a: ['200.1', '1', '1'], b: ['199.9', '1', '1'] },
        },
      });
    });

    const out = await feed.fetch(['BTC/USD', 'ETH/USD']);

    expect(out.get('BTC/USD')).toEqual({ mid: '100000.5', at: expect.any(Date) });
    expect(out.get('ETH/USD')).toEqual({ mid: '3500', at: expect.any(Date) });
    expect(out.has('SOL/USD')).toBe(false);
  });

  it('throws on a kraken error array', async () => {
    const feed = new KrakenFeed(5000);
    mockFetch(async () => jsonResponse({ error: ['EQuery:Unknown asset pair'], result: {} }));

    await expect(feed.fetch(['BTC/USD'])).rejects.toThrow('Unknown asset pair');
  });
});

describe('FiatFeed', () => {
  it('reads USD/XXX rates and the feed timestamp', async () => {
    const feed = new FiatFeed('https://open.er-api.example/v6/latest/USD', 5000);
    mockFetch(async () =>
      jsonResponse({
        result: 'success',
        rates: { EUR: 0.92, GBP: 0.79, KES: 129.5 },
        time_last_update_unix: 1700000000,
      }),
    );

    const out = await feed.fetch(['USD/EUR', 'USD/GBP', 'USD/KES']);

    expect(out.get('USD/EUR')).toEqual({ mid: '0.92', at: new Date(1700000000 * 1000) });
    expect(out.get('USD/GBP')).toEqual({ mid: '0.79', at: new Date(1700000000 * 1000) });
    expect(out.get('USD/KES')).toEqual({ mid: '129.5', at: new Date(1700000000 * 1000) });
  });

  it('throws when the feed does not answer success', async () => {
    const feed = new FiatFeed('https://open.er-api.example/v6/latest/USD', 5000);
    mockFetch(async () => jsonResponse({ result: 'error', 'error-type': 'unknown-code' }));

    await expect(feed.fetch(['USD/KES'])).rejects.toThrow();
  });
});

describe('StubFeed', () => {
  it('reports the configured fixed rates, normalized, fresh every poll', async () => {
    const feed = new StubFeed('{"BTC/USD":"100000.00","USD/KES":"129.50"}');

    const out = await feed.fetch(['BTC/USD', 'USD/KES', 'SOL/USD']);

    expect(out.get('BTC/USD')).toEqual({ mid: '100000', at: expect.any(Date) });
    expect(out.get('USD/KES')).toEqual({ mid: '129.5', at: expect.any(Date) });
    expect(out.has('SOL/USD')).toBe(false);
  });

  it('fails at construction on malformed config, not on the first poll', () => {
    expect(() => new StubFeed('{"BTC/USD": 100000}')).toThrow('decimal string');
    expect(() => new StubFeed('not json')).toThrow();
    expect(() => new StubFeed('{"BTC/USD":"not-a-rate"}')).toThrow();
  });
});

describe('feed fetch failures propagate (timeout / transport)', () => {
  it('a fetch rejection surfaces to the aggregator', async () => {
    const feed = new CoinbaseFeed(5000);
    mockFetch(async () => {
      throw new DOMException('The operation was aborted', 'AbortError');
    });

    await expect(feed.fetch(['BTC/USD'])).rejects.toThrow('aborted');
  });
});
