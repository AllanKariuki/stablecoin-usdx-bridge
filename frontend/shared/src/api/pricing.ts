import { get, patch } from './client';

/**
 * The pair policy and indicative rates surface (services/pricing): how wide
 * the spread, how long a quote lives and whether a pair quotes at all, plus
 * the aggregated mids the quote path stands behind. max_notional_usd is a
 * decimal string; spread_bps/ttl_seconds are integers.
 */
export interface PricingPair {
  baseCcy: string;
  quoteCcy: string;
  spreadBps: number;
  ttlSeconds: number;
  enabled: boolean;
  maxNotionalUsd: string;
  updatedAt: string;
  updatedBy: string;
}

export type PriceStatus = 'OK' | 'STALE' | 'TRIPPED';

export interface SymbolStatus {
  currency: string;
  rate: string | null;
  status: PriceStatus;
  sources: string[];
  at: string | null;
}

export interface RateBoard {
  base: string;
  entries: SymbolStatus[];
}

export interface PairPatch {
  spread_bps?: number;
  ttl_seconds?: number;
  enabled?: boolean;
  max_notional_usd?: string;
}

const id = encodeURIComponent;

export const pricingApi = {
  pairs: async () => (await get<{ pairs: PricingPair[] }>('/pricing/pairs')).pairs,
  rates: (base = 'USD') => get<RateBoard>('/pricing/rates', { base }),
  updatePair: (base: string, quote: string, input: PairPatch) =>
    patch<PricingPair>(`/pricing/pairs/${id(base)}/${id(quote)}`, input),
};
