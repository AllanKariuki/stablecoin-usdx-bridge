import { get, http, post } from './client';

/**
 * core-ledger's operator surface (ledger:read / ledger:admin /
 * transactions:reverse), forwarded by bff unchanged — so these are
 * core-ledger's own snake_case shapes and decimal strings, not Money.
 */
export interface LedgerAccount {
  id: string;
  gl_code: string;
  name: string;
  type: string;
  currency: string;
  status: string;
  balance: string;
}

export interface TrialBalance {
  currency: string;
  as_of: string;
  balanced: boolean;
  total_debits: string;
  total_credits: string;
  lines: Array<{ gl_code: string; name: string; type: string; debits: string; credits: string; balance: string }>;
}

export interface IntegrityReport {
  healthy: boolean;
  divergences: Array<{ gl_code: string; running: string; derived: string }>;
}

export interface PeriodClosure {
  id: string;
  currency: string;
  closing_date: string;
  reason: string;
  closed_by: string;
  created_at: string;
}

/** core-ledger's own transaction rendering (snake_case). Only the id is relied on. */
export interface RawLedgerTransaction {
  id: string;
  [field: string]: unknown;
}

const id = encodeURIComponent;

export const ledgerAdminApi = {
  accounts: (params: { cursor?: string; limit?: number } = {}) =>
    get<{ accounts: LedgerAccount[]; next_cursor: string }>('/accounts', params),
  accountBalance: (glCode: string) =>
    get<{ gl_code: string; name: string; type: string; currency: string; balance: string }>(`/accounts/${id(glCode)}/balance`),
  trialBalance: (currency: string) => get<TrialBalance>('/ledger/trial-balance', { currency }),
  /** 409 means divergences were found — that is a result, not a failure. */
  integrity: async () => (await http.get<IntegrityReport>('/ledger/integrity', { validateStatus: (s) => s === 200 || s === 409 })).data,
  closePeriod: (input: { currency?: string; closing_date: string; reason: string }) => post<PeriodClosure>('/ledger/closures', input),
  /** Posts a contra-entry; the original is never edited or deleted. */
  reverse: (transactionId: string, reason: string) => post<RawLedgerTransaction>(`/transactions/${id(transactionId)}/reversal`, { reason }),
  /** Break-glass: confirm a redemption whose burn is final on chain but the saga lost track of. */
  confirmRedemption: (transactionId: string, input: { chain_tx_hash: string; reason: string }, idempotencyKey: string) =>
    post<RawLedgerTransaction>(`/redemptions/${id(transactionId)}/confirm`, input, { headers: { 'Idempotency-Key': idempotencyKey } }),
};
