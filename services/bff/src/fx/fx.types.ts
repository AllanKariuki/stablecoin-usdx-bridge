import { TransactionView } from '../transactions/transaction.types';
import { SagaStatus } from '../issuance/issuance.types';

/**
 * The customer-facing conversion surface (slice 4b): quotes and
 * conversions, every response stamped with which of the three routes the
 * platform will take — FX through services/pricing and the ledger's
 * FX_CONVERSION, or the USD-X peg through issuance/redemption.
 */

export type ConversionRoute = 'FX' | 'ISSUANCE' | 'REDEMPTION';

/** The quote preview every POST /quotes response takes: pricing's own
 * numbers when the route is FX (see services/pricing/src/quotes/
 * quotes.service.ts's QuoteResponse), a synthetic 1:1 peg for the
 * USD<->USD-X pair. quote_id is null exactly when nothing was minted —
 * a peg preview describes what the conversion will do, it does not pin
 * anything. */
export interface QuotePreviewView {
  quote_id: string | null;
  route: ConversionRoute;
  from: string;
  to: string;
  amount: string;
  rate: string;
  fee: string;
  net: string;
  expires_at: string | null;
}

/** What POST /conversions answers with: the route taken, plus the handle
 * that route produced — a ledger transaction for FX, the saga handle for
 * the peg routes. */
export interface ConversionResultView {
  route: ConversionRoute;
  transaction: TransactionView;
  correlationId: string | null;
  sagaStatus: SagaStatus | null;
  status: string;
}
