import { Injectable } from '@nestjs/common';
import { PlatformException } from '@damp/nest-platform';
import { AuthContext } from '../auth/current-user.decorator';
import { CoreLedgerClient } from '../core-ledger/core-ledger.client';
import { CoreLedgerSagaAccepted, toSagaAcceptedView } from '../issuance/issuance.types';
import { CoreLedgerTransaction, toTransactionView } from '../transactions/transaction.types';
import { TransactionsService, TransactionPage } from '../transactions/transactions.service';
import { WalletOwnership } from '../wallets/wallet-ownership.service';
import { WalletsService } from '../wallets/wallets.service';
import { PricingClient } from './pricing.client';
import { ConversionResultView, ConversionRoute, QuotePreviewView } from './fx.types';

interface QuoteInput {
  fromWalletId: string;
  toWalletId?: string;
  toCurrency?: string;
  amount: string;
  amountSide?: string;
}

interface ConvertInput {
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  quoteId?: string;
}

/** pricing's QuoteResponse (services/pricing/src/quotes/quotes.service.ts),
 * the fields bff passes through untouched. */
interface PricingQuoteResponse {
  quote_id: string;
  from: string;
  to: string;
  amount_side: 'FROM' | 'TO';
  amount: string;
  rate: string;
  spread_bps: number;
  gross: string;
  fee: string;
  net: string;
  expires_at: string;
  sources: string[];
}

const USDX = 'USDX';
const USD = 'USD';

/** The transaction types GET /conversions returns, forwarded to
 * core-ledger's transaction feed as its `type` filter. */
const CONVERSION_TYPES = ['FX_CONVERSION', 'USDX_ISSUE', 'USDX_REDEEM'];

/**
 * The customer-facing quote/conversion flow (slice 4b).
 *
 * Every route derives the caller's identity from the auth context only, and
 * every wallet the request names is ownership-checked before any other
 * service is asked for anything (see WalletOwnership — core-ledger posts
 * to whatever wallet id it is handed).
 *
 * The USD-X pair never reaches services/pricing: it is issued 1:1 against
 * USD, so a quote for USD<->USD-X is a synthetic peg preview (nothing is
 * minted, quote_id is null) and a conversion books the existing
 * issuance/redemption journals. Any other USD-X pair is refused — FX never
 * prices USD-X, so it must be converted to USD first.
 */
@Injectable()
export class FxService {
  constructor(
    private readonly coreLedger: CoreLedgerClient,
    private readonly wallets: WalletsService,
    private readonly ownership: WalletOwnership,
    private readonly transactions: TransactionsService,
    private readonly pricing: PricingClient,
  ) {}

  async quote(auth: AuthContext, input: QuoteInput): Promise<QuotePreviewView> {
    if (typeof input.amount !== 'string' || input.amount.trim() === '') {
      throw new PlatformException(400, 'INVALID_REQUEST', 'amount is required');
    }
    const toOwn = input.toWalletId ? [input.fromWalletId, input.toWalletId] : [input.fromWalletId];
    await this.ownership.requireOwnWallets(auth, toOwn);

    const fromWallet = await this.wallets.getWallet(input.fromWalletId);
    const from = fromWallet.currency;
    let to: string;
    if (input.toWalletId) {
      to = (await this.wallets.getWallet(input.toWalletId)).currency;
    } else {
      to = (input.toCurrency ?? '').trim().toUpperCase();
      if (!to) {
        throw new PlatformException(400, 'INVALID_REQUEST', 'to_wallet_id or to_currency is required');
      }
    }
    if (from === to) {
      throw new PlatformException(422, 'SAME_CURRENCY', `nothing to convert: both wallets hold ${from}`);
    }

    if (from === USDX || to === USDX) {
      return this.pegPreview(from, to, input.amount);
    }

    // The FX route: pricing prices it, pins it to the caller, and core-ledger
    // will only ever execute it against this exact amount and party.
    const quote = await this.pricing.post<PricingQuoteResponse>('/quotes', {
      from,
      to,
      amount: input.amount,
      party_id: auth.userId,
      amount_side: input.amountSide ? input.amountSide.toUpperCase() : undefined,
    });
    return { ...quote, route: 'FX' };
  }

  async convert(auth: AuthContext, input: ConvertInput, idempotencyKey: string): Promise<ConversionResultView> {
    await this.ownership.requireOwnWallets(auth, [input.fromWalletId, input.toWalletId]);

    const fromWallet = await this.wallets.getWallet(input.fromWalletId);
    const toWallet = await this.wallets.getWallet(input.toWalletId);
    const from = fromWallet.currency;
    const to = toWallet.currency;
    if (from === to) {
      throw new PlatformException(422, 'SAME_CURRENCY', `nothing to convert: both wallets hold ${from}`);
    }

    if (from === USDX || to === USDX) {
      return this.convertUsdX(auth, input, idempotencyKey, from, to);
    }

    const tx = await this.coreLedger.post<CoreLedgerTransaction>(
      '/fx/conversions',
      {
        from_wallet_id: input.fromWalletId,
        to_wallet_id: input.toWalletId,
        amount: input.amount,
        quote_id: input.quoteId ?? '',
      },
      { idempotencyKey, actor: auth.userId },
    );
    return { route: 'FX', transaction: toTransactionView(tx), correlationId: null, sagaStatus: null, status: tx.status };
  }

  async listConversions(userId: string, cursor?: string, limit?: number): Promise<TransactionPage> {
    // The type filter runs in core-ledger's query, before the limit and the
    // keyset cursor — so a conversation older than the page size still
    // pages into view, and the cursor returned is a cursor into this feed.
    return this.transactions.listForUser(userId, cursor, Math.min(Math.max(limit ?? 50, 1), 200), CONVERSION_TYPES);
  }

  /**
   * The only USD-X quote there is: the 1:1 peg against USD, described
   * rather than minted. bff does not know the issuance/redemption fee
   * schedule (it lives in core-ledger), so the fee is 0 — the peg itself
   * is 1:1; the conversion books whatever fee the ledger applies.
   */
  private pegPreview(from: string, to: string, amount: string): QuotePreviewView {
    const route = pegRoute(from, to);
    if (!route) {
      throw new PlatformException(
        422,
        'USDX_USES_ISSUANCE',
        'USD-X is never quoted against anything but USD: convert to USD first, then quote USD against the target',
      );
    }
    return { quote_id: null, route, from, to, amount, rate: '1', fee: '0', net: amount, expires_at: null };
  }

  /** USD-X conversions book the issuance/redemption journals — the same
   * core-ledger calls the issuance controller makes, with the same
   * idempotency-key discipline. */
  private async convertUsdX(
    auth: AuthContext,
    input: ConvertInput,
    idempotencyKey: string,
    from: string,
    to: string,
  ): Promise<ConversionResultView> {
    const route = pegRoute(from, to);
    if (!route) {
      throw new PlatformException(
        422,
        'USDX_TWO_STEP',
        'USD-X converts to USD first, then USD converts again: FX never prices USD-X',
      );
    }

    const raw =
      route === 'ISSUANCE'
        ? await this.coreLedger.post<CoreLedgerSagaAccepted>(
            '/issuances',
            { fiat_wallet_id: input.fromWalletId, usdx_wallet_id: input.toWalletId, amount: input.amount },
            { idempotencyKey, actor: auth.userId },
          )
        : await this.coreLedger.post<CoreLedgerSagaAccepted>(
            '/redemptions',
            { usdx_wallet_id: input.fromWalletId, fiat_wallet_id: input.toWalletId, amount: input.amount },
            { idempotencyKey, actor: auth.userId },
          );
    const accepted = toSagaAcceptedView(raw);
    return {
      route,
      transaction: accepted.transaction,
      correlationId: accepted.correlationId,
      sagaStatus: accepted.sagaStatus,
      status: accepted.sagaStatus,
    };
  }
}

/** Which peg route a USD-X pair takes, or null when the pair is not the peg. */
function pegRoute(from: string, to: string): ConversionRoute | null {
  if (from === USD && to === USDX) return 'ISSUANCE';
  if (from === USDX && to === USD) return 'REDEMPTION';
  return null;
}
