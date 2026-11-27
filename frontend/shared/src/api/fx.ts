import { get, post, qs, withIdempotency } from './client';
import type { SagaStatus, Transaction } from './types';

/**
 * The customer-facing conversion surface (slice 4b): POST /quotes,
 * POST /conversions and GET /conversions in services/bff. Every response
 * carries `route` — FX through services/pricing, ISSUANCE/REDEMPTION for
 * the 1:1 USD-X peg — typed against bff's exact wire shapes
 * (services/bff/src/fx/fx.types.ts).
 */
export type ConversionRoute = 'FX' | 'ISSUANCE' | 'REDEMPTION';

export interface QuotePreview {
  /** null exactly when nothing was minted: the USD<->USD-X peg preview
   * describes the 1:1 conversion, it does not pin a rate anywhere. */
  quoteId: string | null;
  route: ConversionRoute;
  from: string;
  to: string;
  amount: string;
  rate: string;
  fee: string;
  net: string;
  expiresAt: string | null;
  /** FX quotes only: which side `amount` fixed, and the pre-spread numbers
   * the ledger will book. */
  amountSide?: 'FROM' | 'TO';
  spreadBps?: number;
  gross?: string;
  sources?: string[];
}

export interface ConversionResult {
  route: ConversionRoute;
  transaction: Transaction;
  correlationId: string | null;
  sagaStatus: SagaStatus | null;
  status: string;
}

export interface ConversionPage {
  transactions: Transaction[];
  nextCursor: string;
}

export interface QuoteInput {
  fromWalletId: string;
  /** Either toWalletId or toCurrency names the target. */
  toWalletId?: string;
  toCurrency?: string;
  amount: string;
  /** Which side `amount` fixes: FROM (the default) prices what you send,
   * TO solves for what nets the target amount. */
  amountSide?: 'FROM' | 'TO';
}

export const fxApi = {
  quote: (input: QuoteInput) => post<QuotePreview>('/quotes', input),
  /** A conversion moves money, so the idempotency key is required — mint it
   * once per user intent (see newIdempotencyKey) and reuse it on retries. */
  convert: (input: { fromWalletId: string; toWalletId: string; amount: string; quoteId?: string }, key: string) =>
    post<ConversionResult>('/conversions', input, withIdempotency(key)),
  conversions: (params: { cursor?: string; limit?: number } = {}) => get<ConversionPage>(`/conversions${qs(params)}`),
};
