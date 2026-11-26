import { ConfigService } from '@nestjs/config';
import { ServiceTokenClient } from '@damp/nest-platform';
import { DbExposureGuard } from '../src/exposure/db-exposure.guard';
import { deltasFor, RmsExposureGuard } from '../src/exposure/rms-exposure.guard';
import { PricingPair } from '../src/pairs/pairs.repository';

/**
 * The composed exposure guard: the rms house-position check runs before the
 * local reservation, refuses with 422 EXPOSURE_LIMIT_EXCEEDED when rms says
 * the mandate is breached, and fails closed with 503 when rms is
 * unreachable. fetch is mocked — what is under test is exactly what rms is
 * asked, in what order, and how each answer maps to a refusal.
 */

const PAIR: PricingPair = {
  baseCcy: 'KES',
  quoteCcy: 'BTC',
  spreadBps: 100,
  ttlSeconds: 30,
  enabled: true,
  maxNotionalUsd: '10000',
  updatedAt: '',
  updatedBy: '',
};

// KES -> BTC at 1 KES = 0.00000002 BTC, no spread: 130,000 KES buys
// 260,000 sat = 0.0026 BTC gross.
const QUOTE = {
  base: 'KES',
  quote: 'BTC',
  fromAmount: '130000.00',
  rate: '0.00000002',
  spreadBps: 0,
  sources: ['stub'],
};

function guard(overrides: { fetchImpl?: jest.Mock } = {}) {
  const config = { get: (key: string) => (key === 'RMS_URL' ? 'http://rms.internal' : undefined) } as unknown as ConfigService;
  const tokens = { accessToken: jest.fn(async () => 'tok-pricing') } as unknown as ServiceTokenClient;
  const inner = {
    reserve: jest.fn(async () => ({ issue: jest.fn(), cancel: jest.fn() })),
  } as unknown as DbExposureGuard;

  const fetchImpl =
    overrides.fetchImpl ??
    (jest.fn(async () => ({ ok: true, status: 200 } as unknown as Response)) as jest.Mock);
  jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);

  const g = new RmsExposureGuard(config, tokens, inner);
  return { g, inner, fetchImpl, tokens };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('deltasFor', () => {
  it('is +gross units of the to-leg for crypto received', () => {
    expect(deltasFor(QUOTE)).toEqual([{ currency: 'BTC', delta: '0.00260000' }]);
  });

  it('is -amount of the from-leg for crypto given back', () => {
    expect(deltasFor({ ...QUOTE, base: 'BTC', quote: 'KES' })).toEqual([
      { currency: 'BTC', delta: '-130000.00' },
    ]);
  });

  it('checks both legs of a crypto-to-crypto quote', () => {
    // The quote flow normalizes fromAmount to the currency's own scale
    // before the guard sees it (quotes.service.ts), so the guard passes the
    // amount through as it arrives.
    const deltas = deltasFor({ ...QUOTE, base: 'BTC', quote: 'ETH', fromAmount: '0.50000000' });
    expect(deltas.map((d) => d.currency)).toEqual(['ETH', 'BTC']);
    expect(deltas[0].delta).not.toMatch(/^-/);
    expect(deltas[1].delta).toBe('-0.50000000');
  });

  it('produces no check for a pure fiat pair', () => {
    expect(deltasFor({ ...QUOTE, base: 'USD', quote: 'KES' })).toEqual([]);
  });
});

describe('RmsExposureGuard composition', () => {
  it('asks rms for each crypto leg, then delegates to the local guard', async () => {
    const { g, inner, fetchImpl } = guard();

    await g.reserve(PAIR, '1000', 'party_1', QUOTE);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/exposure/check');
    expect(JSON.parse(init.body as string)).toEqual({ currency: 'BTC', delta: '0.00260000' });
    expect(init.headers).toMatchObject({
      'X-User-Id': 'pricing',
      Authorization: 'Bearer tok-pricing',
    });
    expect(inner.reserve).toHaveBeenCalledWith(PAIR, '1000', 'party_1', QUOTE);
  });

  it('skips rms entirely for a pure fiat pair and still reserves locally', async () => {
    const { g, inner, fetchImpl } = guard();
    await g.reserve(PAIR, '1000', 'party_1', { ...QUOTE, base: 'USD', quote: 'KES' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(inner.reserve).toHaveBeenCalledTimes(1);
  });

  it('refuses with 422 EXPOSURE_LIMIT_EXCEEDED when rms refuses, before any reservation', async () => {
    const { g, inner } = guard({
      fetchImpl: jest.fn(async () => ({ ok: false, status: 422, text: async () => 'limit' }) as unknown as Response),
    });

    await expect(g.reserve(PAIR, '1000', 'party_1', QUOTE)).rejects.toMatchObject({
      response: { code: 'EXPOSURE_LIMIT_EXCEEDED' },
    });
    expect(inner.reserve).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when rms is unreachable', async () => {
    const { g, inner, fetchImpl } = guard({
      fetchImpl: jest.fn(async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as jest.Mock,
    });

    await expect(g.reserve(PAIR, '1000', 'party_1', QUOTE)).rejects.toMatchObject({
      response: { code: 'RMS_UNAVAILABLE' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(inner.reserve).not.toHaveBeenCalled();
  });

  it('fails closed with 503 on any non-422 rms failure', async () => {
    const { g, inner } = guard({
      fetchImpl: jest.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' }) as unknown as Response),
    });

    await expect(g.reserve(PAIR, '1000', 'party_1', QUOTE)).rejects.toMatchObject({
      response: { code: 'RMS_UNAVAILABLE' },
    });
    expect(inner.reserve).not.toHaveBeenCalled();
  });

  it('checks both legs of a crypto-to-crypto quote', async () => {
    const { g, inner, fetchImpl } = guard();
    await g.reserve(PAIR, '1000', 'party_1', { ...QUOTE, base: 'BTC', quote: 'ETH', fromAmount: '0.50000000' });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const bodies = fetchImpl.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(bodies).toEqual([
      { currency: 'ETH', delta: expect.not.stringMatching(/^-/) },
      { currency: 'BTC', delta: '-0.50000000' },
    ]);
    expect(inner.reserve).toHaveBeenCalledTimes(1);
  });
});
