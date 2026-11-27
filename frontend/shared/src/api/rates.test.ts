import { describe, expect, it } from 'vitest';
import { historyQuery } from './rates';

describe('historyQuery', () => {
  it('normalizes symbols, range and base for the wire', () => {
    expect(historyQuery(['btc', 'eth'], '1d', 'usd')).toEqual({
      symbols: 'BTC,ETH',
      range: '1D',
      base: 'USD',
    });
  });

  it('trims and de-duplicates symbols, keeping the first occurrence', () => {
    expect(historyQuery([' sol ', 'BTC', 'SOL', 'eth'], '1W')).toEqual({
      symbols: 'SOL,BTC,ETH',
      range: '1W',
      base: 'USD',
    });
  });

  it('filters out empty symbols rather than sending blank segments', () => {
    expect(historyQuery(['', 'btc', '  '], '1Y', 'kes')).toEqual({
      symbols: 'BTC',
      range: '1Y',
      base: 'KES',
    });
  });
});
