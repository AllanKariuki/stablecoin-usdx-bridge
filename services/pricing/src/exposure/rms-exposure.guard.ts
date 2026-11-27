import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformException, ServiceTokenClient } from '@damp/nest-platform';
import { convertAmount, decimalsFor, fromScaled, parseRate, toScaled } from '../money/rate';
import { PricingPair } from '../pairs/pairs.repository';
import { DbExposureGuard } from './db-exposure.guard';
import { ExposureReservation, ReservationQuote } from './exposure-guard';

const CUSTODIAL_CRYPTO = ['BTC', 'ETH', 'SOL'];

/**
 * The slice-3 guard: before a quote is minted, ask rms whether the trade
 * would push the house's custodial-crypto position through its exposure
 * limits — on top of the per-quote and per-party caps DbExposureGuard
 * enforces locally.
 *
 * The delta for a crypto leg is the signed change in customer liabilities
 * the quote would cause, exactly the shape rms' POST /exposure/check
 * defines: when customers receive `to` crypto the house gets more short
 * (+gross units of `to`); when they give `from` crypto back it gets more
 * long (-amount of `from`). Fiat legs are not checked — a fiat position is
 * not the exposure this mandate governs.
 *
 * The rms check runs before the local reservation, so a refusal costs
 * nothing to release, and the guard fails closed: rms unreachable is a 503,
 * because quoting past an exposure limit you cannot see is exactly the
 * failure this exists to prevent.
 *
 * Bound under the EXPOSURE_GUARD token with DbExposureGuard as its inner
 * guard — the quotes flow still sees one ExposureGuard, and the local caps
 * still apply after the house check passes.
 */
@Injectable()
export class RmsExposureGuard {
  private readonly baseUrl: string;

  constructor(
    config: ConfigService,
    private readonly serviceTokens: ServiceTokenClient,
    private readonly inner: DbExposureGuard,
  ) {
    this.baseUrl = config.get<string>('RMS_URL', { infer: true })!;
  }

  async reserve(
    pair: PricingPair,
    notionalUsd: string,
    partyId: string,
    quote: ReservationQuote,
  ): Promise<ExposureReservation> {
    // House exposure first: refuse before any reservation row exists, so a
    // refusal leaves nothing behind to release.
    for (const { currency, delta } of deltasFor(quote)) {
      await this.check(currency, delta);
    }
    return this.inner.reserve(pair, notionalUsd, partyId, quote);
  }

  private async check(currency: string, delta: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch(new URL('/exposure/check', this.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // X-User-Id names pricing for rms' audit trail; the bearer is
          // pricing's own service-account token, which carries the rms
          // audience (aud-mapper-rms in the Keycloak template) and the
          // rms.exposure.check role.
          'X-User-Id': 'pricing',
          Authorization: `Bearer ${await this.serviceTokens.accessToken()}`,
        },
        body: JSON.stringify({ currency, delta }),
      });
    } catch (err) {
      throw new PlatformException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'RMS_UNAVAILABLE',
        `rms exposure check unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (res.status === 422) {
      const detail = await res.text().catch(() => '');
      throw new PlatformException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'EXPOSURE_LIMIT_EXCEEDED',
        `rms refused the ${currency} exposure: ${detail.slice(0, 500)}`,
      );
    }
    if (!res.ok) {
      // Fail closed: any other rms failure means the house position is
      // unknown, and quoting on an unknown position is the risk.
      throw new PlatformException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'RMS_UNAVAILABLE',
        `rms POST /exposure/check returned ${res.status}`,
      );
    }
  }
}

/**
 * The rms checks one quote's crypto legs produce: at most two entries —
 * the `to` leg when it is custodial crypto, the `from` leg when it is —
 * and none at all for a pure fiat pair.
 */
export function deltasFor(quote: ReservationQuote): Array<{ currency: string; delta: string }> {
  const out: Array<{ currency: string; delta: string }> = [];

  if (CUSTODIAL_CRYPTO.includes(quote.quote)) {
    // Customers gain `to`: the house's short deepens by the gross units of
    // `to` the quote produces (pre-spread gross — the number that actually
    // lands in the customer's wallet is net, but the exposure the house
    // takes is the full gross before the spread is booked to revenue).
    const gross = convertAmount(
      toScaled(quote.fromAmount, decimalsFor(quote.base)),
      parseRate(quote.rate),
      decimalsFor(quote.base),
      decimalsFor(quote.quote),
      quote.spreadBps,
    ).gross;
    out.push({ currency: quote.quote, delta: fromScaled(gross, decimalsFor(quote.quote)) });
  }

  if (CUSTODIAL_CRYPTO.includes(quote.base)) {
    // Customers give `from` back: the house gets more long by the amount
    // they convert away from it.
    out.push({ currency: quote.base, delta: `-${quote.fromAmount}` });
  }

  return out;
}
