import { get, post, put } from './client';

/**
 * The treasury desk's crypto exposure surface (services/rms): the house's
 * net position per custodial crypto currency with its policy limits, the
 * custodian's word for the same holdings, and the rebalance trades the desk
 * posts. Amounts are decimal strings at each currency's own scale — never
 * parsed into numbers on the client.
 */
export interface ExposureLimit {
  currency: string;
  maxShort: string;
  maxLong: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ExposureRow {
  currency: string;
  decimals: number;
  customerLiabilities: string;
  custodyHoldings: string;
  fxPosition: string;
  /** Signed decimal string; negative means the house is short. */
  netExposure: string;
  limits: ExposureLimit | null;
  /** How much of the applicable limit the position uses, in basis points. */
  utilisationBps: number | null;
  custodianSnapshot: {
    custodianIds: string[];
    balance: string;
    asOf: string;
    statementRef: string;
  } | null;
  recon: {
    status: 'MATCH' | 'DRIFT';
    tolerance: string;
    custodianReported: string;
    ledgerHoldings: string;
    diff: string;
  } | null;
}

export interface TreasuryRebalance {
  id: string;
  side: 'BUY' | 'SELL';
  currency: string;
  amount: string;
  fiat_currency: string;
  fiat_amount: string;
  custodian_ref: string;
  note: string;
  ledger_tx_id: string;
  created_by: string;
  created_at: string;
}

/** POST /treasury/rebalances returns either the new row or a replay marker. */
export type RebalanceResponse = { replay: true; ledger_tx_id: string } | TreasuryRebalance;

const id = encodeURIComponent;

export const treasuryApi = {
  exposure: async () => (await get<{ currencies: ExposureRow[] }>('/exposure')).currencies,
  limit: async (currency: string) => (await get<{ limit: ExposureLimit | null }>(`/exposure/limits/${id(currency)}`)).limit,
  setLimit: (currency: string, input: { max_short: string; max_long: string }) =>
    put<ExposureLimit>(`/exposure/limits/${id(currency)}`, input),
  rebalances: async (limit = 50) => (await get<{ rebalances: TreasuryRebalance[] }>('/treasury/rebalances', { limit })).rebalances,
  postRebalance: (input: {
    side: 'BUY' | 'SELL';
    currency: string;
    amount: string;
    fiat_currency: string;
    fiat_amount: string;
    custodian_ref?: string;
    note?: string;
  }) => post<RebalanceResponse>('/treasury/rebalances', input),
};
