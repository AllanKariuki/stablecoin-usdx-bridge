import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PlatformException } from '@damp/nest-platform';
import { CoreLedgerClient, LedgerQuote } from '../core-ledger/core-ledger.client';
import { EXPOSURE_GUARD, ExposureGuard } from '../exposure/exposure-guard';
import { convertAmount, decimalsFor, formatRate, fromScaled, isQuotable, minimalFromAmount, toScaled } from '../money/rate';
import { PairsRepository } from '../pairs/pairs.repository';
import { Aggregator, PricingRateError, RateResult } from '../rates/aggregator';

export interface QuoteRequest {
  from: string;
  to: string;
  amount: string;
  partyId: string;
  /**
   * Which side of the conversion `amount` fixes. FROM (the default): the
   * payer sends `amount` of `from`. TO: the payee must net `amount` of `to`
   * — an invoice amount, say — and pricing solves for the `from` amount the
   * quote is pinned to.
   */
  amountSide?: 'FROM' | 'TO';
}

export interface QuoteResponse {
  quote_id: string;
  from: string;
  to: string;
  /** Which side was requested, echoed so a TO-side caller knows `amount`
   * was solved for rather than taken from the request. */
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

/**
 * The quote flow, end to end: validate, price, bound the exposure, mint
 * the quote in core-ledger, record it here.
 *
 * `amount` fixes one side of the conversion. FROM quotes (the default) take
 * it as the payer's `from` amount outright; TO quotes take it as the net the
 * payee must receive in `to` and solve for the smallest `from` amount that
 * nets at least that — which is what an invoice payment needs, since the
 * invoice is fixed in the payee's currency. The solved amount then flows
 * through the pipeline exactly as a FROM-side amount would: it is the
 * notional the exposure guard sees and the amount the ledger pins.
 *
 * The order is reserve-first. The exposure guard writes a RESERVED row —
 * counted against the party's outstanding cap — before the ledger is
 * asked anything, so two concurrent requests from one party cannot both
 * pass the cap before either is recorded. The ledger call is still the
 * last irreversible step: every refusal (USD-X, stale, tripped, over a
 * cap) happens before core-ledger has seen anything, and on a ledger
 * failure the reservation is deleted so the cap is not burned.
 */
@Injectable()
export class QuotesService {
  constructor(
    private readonly ledger: CoreLedgerClient,
    private readonly aggregator: Aggregator,
    private readonly pairs: PairsRepository,
    @Inject(EXPOSURE_GUARD) private readonly exposure: ExposureGuard,
  ) {}

  async create(input: QuoteRequest): Promise<QuoteResponse> {
    const from = input.from.toUpperCase();
    const to = input.to.toUpperCase();
    const amountSide = (input.amountSide ?? 'FROM').toUpperCase() as 'FROM' | 'TO';
    if (amountSide !== 'FROM' && amountSide !== 'TO') {
      throw new PlatformException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_AMOUNT_SIDE',
        `amount_side must be FROM or TO, not ${input.amountSide}`,
      );
    }

    // USD-X must never be quoted — it is issued 1:1 against USD, the ledger
    // rejects any USD-X pair with USDX_USES_ISSUANCE, and pricing refuses
    // before the call is even made.
    if (from === 'USDX' || to === 'USDX') {
      throw new PlatformException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'USDX_USES_ISSUANCE',
        'USD-X is never quoted: it is issued 1:1 against USD, so route issuance instead',
      );
    }
    if (!isQuotable(from) || !isQuotable(to)) {
      throw new PlatformException(HttpStatus.UNPROCESSABLE_ENTITY, 'UNSUPPORTED_PAIR', `${from}/${to} is not a quotable pair`);
    }
    if (from === to) {
      throw new PlatformException(HttpStatus.UNPROCESSABLE_ENTITY, 'SAME_CURRENCY', `${from} to ${from} is not a conversion`);
    }

    const fromDecimals = decimalsFor(from);
    const toDecimals = decimalsFor(to);
    // The side the request amount is denominated in: FROM quotes price what
    // the payer sends, TO quotes net what the payee must receive.
    const amountDecimals = amountSide === 'FROM' ? fromDecimals : toDecimals;
    const amountCurrency = amountSide === 'FROM' ? from : to;
    let amountScaled: bigint;
    try {
      amountScaled = toScaled(input.amount, amountDecimals);
    } catch (err) {
      throw new PlatformException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_AMOUNT',
        `${input.amount} is not a ${amountCurrency} amount: ${err instanceof Error ? err.message : 'invalid decimal'}`,
      );
    }
    if (amountScaled <= 0n) {
      throw new PlatformException(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_AMOUNT', 'amount must be greater than zero');
    }

    // A party pin is what makes the exposure guard's per-party cap real;
    // an unpinned quote could be consumed by anyone inside its TTL.
    if (!input.partyId.trim()) {
      throw new PlatformException(HttpStatus.UNPROCESSABLE_ENTITY, 'PARTY_ID_REQUIRED', 'party_id is required: quotes are pinned to one party');
    }
    const partyId = input.partyId.trim();

    const pair = await this.pairs.find(from, to);
    if (!pair) {
      throw new PlatformException(HttpStatus.UNPROCESSABLE_ENTITY, 'PAIR_NOT_CONFIGURED', `${from}/${to} has no pricing_pairs row`);
    }
    if (!pair.enabled) {
      throw new PlatformException(HttpStatus.UNPROCESSABLE_ENTITY, 'PAIR_DISABLED', `${from}/${to} quoting is disabled`);
    }

    const { rate, sources } = this.rate(from, to);

    if (amountSide === 'TO') {
      // Solve for the smallest from_amount whose conversion nets at least the
      // requested target. Everything downstream — the notional, the exposure
      // reservation, the ledger pin — keys off the solved amount, exactly as
      // it would for a FROM-side quote of that size.
      amountScaled = minimalFromAmount(amountScaled, rate, fromDecimals, toDecimals, pair.spreadBps);
    }
    const amount = fromScaled(amountScaled, fromDecimals);

    const notionalUsd = this.notionalUsdOf(from, amountScaled, fromDecimals);
    // Reserve-first: the guard counts this quote against the party's
    // outstanding cap and writes a RESERVED row now, atomically. If the
    // ledger refuses, the reservation is released below.
    const reservation = await this.exposure.reserve(pair, notionalUsd, partyId, {
      base: from,
      quote: to,
      fromAmount: amount,
      rate: formatRate(rate),
      spreadBps: pair.spreadBps,
      sources,
    });

    // The one irreversible step. The rate is the pre-spread mid; the ledger
    // applies spread_bps itself, pins the quote to exactly this amount and
    // this party, and refuses any other consumption.
    let quote: LedgerQuote;
    try {
      quote = await this.ledger.createQuote({
        baseCcy: from,
        quoteCcy: to,
        rate: formatRate(rate),
        spreadBps: pair.spreadBps,
        source: `pricing:${sources.join('+')}`,
        ttlSeconds: pair.ttlSeconds,
        fromAmount: amount,
        partyId,
      });
    } catch (err) {
      // The quote was never minted, so the reservation must not linger: it
      // would otherwise burn the party's outstanding cap until its 60s
      // RESERVED window closed.
      await reservation.cancel();
      throw err;
    }

    await reservation.issue(quote.id, quote.expires_at);

    // The numbers the caller sees are the exact numbers the ledger will
    // book: the same Convert() arithmetic, so a preview can never disagree
    // with the journal by a rounding residue.
    const conversion = convertAmount(amountScaled, rate, fromDecimals, toDecimals, pair.spreadBps);

    return {
      quote_id: quote.id,
      from,
      to,
      amount_side: amountSide,
      amount,
      rate: formatRate(rate),
      spread_bps: pair.spreadBps,
      gross: fromScaled(conversion.gross, toDecimals),
      fee: fromScaled(conversion.fee, toDecimals),
      net: fromScaled(conversion.net, toDecimals),
      expires_at: quote.expires_at,
      sources,
    };
  }

  /** The aggregator's refusal, translated to the envelope a caller acts on. */
  private rate(from: string, to: string): RateResult {
    try {
      return this.aggregator.rateFor(from, to);
    } catch (err) {
      if (err instanceof PricingRateError) {
        if (err.code === 'UNSUPPORTED_PAIR') {
          throw new PlatformException(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message);
        }
        // STALE_PRICE / PAIR_TRIPPED: the pair exists but this service
        // will not stand behind a price right now — a retryable refusal,
        // not a caller error.
        throw new PlatformException(HttpStatus.SERVICE_UNAVAILABLE, err.code, err.message);
      }
      throw err;
    }
  }

  /**
   * The USD value of `amountScaled` of `from`, in 2-decimal USD, computed
   * with the same Convert() arithmetic as everything else here. USD is its
   * own notional; everything else goes through its USD leg.
   */
  private notionalUsdOf(from: string, amountScaled: bigint, fromDecimals: number): string {
    if (from === 'USD') return fromScaled(amountScaled, 2);
    const leg = this.rate(from, 'USD');
    const { gross } = convertAmount(amountScaled, leg.rate, fromDecimals, 2, 0);
    return fromScaled(gross, 2);
  }
}
