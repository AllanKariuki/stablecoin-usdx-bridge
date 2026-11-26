import { get } from './client';
import type { RateBoard } from './pricing';

/**
 * The portal's price surface (slice 4c): the customer-facing GET /rates
 * and GET /rates/history in services/bff, proxied to services/pricing.
 * Distinct from pricingApi's /pricing/* paths, which stay an ops-console
 * (reserves:read) surface.
 */
export type HistoryRange = '1H' | '1D' | '1W' | '1M' | '1Y' | 'ALL';

export interface HistoryPoint {
  /** ISO instant of the point. */
  t: string;
  /** The price of one symbol unit in `base`, as a decimal string. */
  price: string;
}

export interface HistorySeries {
  symbol: string;
  points: HistoryPoint[];
  /** (last-first)/first*100 over the returned points, as a 2-dp string;
   * null for a series with fewer than two points. */
  change_pct: string | null;
}

export interface RateHistory {
  base: string;
  range: string;
  series: HistorySeries[];
}

/** The normalized query parameters for GET /rates/history: symbols
 * uppercased, de-duplicated and emptied of blanks (the server derives the
 * stored USD leg per currency), range and base uppercased — range
 * validation itself is the server's (422 INVALID_RANGE). */
export function historyQuery(symbols: string[], range: string, base = 'USD') {
  return {
    symbols: [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].join(','),
    range: range.toUpperCase(),
    base: base.toUpperCase(),
  };
}

export const ratesApi = {
  rates: (base = 'USD') => get<RateBoard>('/rates', { base }),
  history: (symbols: string[], range: HistoryRange = '1D', base = 'USD') => {
    const query = historyQuery(symbols, range, base);
    return get<RateHistory>(`/rates/history?symbols=${encodeURIComponent(query.symbols)}&range=${query.range}&base=${encodeURIComponent(query.base)}`);
  },
};
