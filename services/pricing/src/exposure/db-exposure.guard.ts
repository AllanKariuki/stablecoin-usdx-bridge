import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformException } from '@damp/nest-platform';
import { DbService } from '../db/db.service';
import { toScaled } from '../money/rate';
import { PricingPair } from '../pairs/pairs.repository';
import { ExposureGuard, ExposureReservation, ReservationQuote } from './exposure-guard';

/**
 * The default exposure guard, enforcing the two ceilings the schema holds:
 *
 *  - the pair's own max_notional_usd, per quote;
 *  - PRICING_PARTY_OUTSTANDING_USD, a cap on the party's outstanding quoted
 *    notional — the sum of unexpired (still consumable) quotes plus in-flight
 *    reservations.
 *
 * The party cap is outstanding, not daily: the portal re-quotes every ~30s
 * while a user looks at a conversion screen, and an abandoned quote is never
 * consumed, so a rolling 24h window would let those abandoned quotes burn
 * the party's allowance. Only quotes that can still be consumed are exposure.
 * Daily/tiered spend limits are a bff/KYC-tier concern and deliberately do
 * not live here.
 *
 * The cap check is reserve-first and atomic: the sum and the INSERT of a
 * RESERVED row happen in one transaction under a per-party advisory lock, so
 * two concurrent requests from one party cannot both pass the cap before
 * either has been recorded. The caller then flips the reservation to ISSUED
 * (ledger ok) or deletes it (ledger failed). Both comparisons are on scaled
 * integers — NUMERIC columns are read back as strings and never coerced with
 * parseFloat.
 */
@Injectable()
export class DbExposureGuard implements ExposureGuard {
  private readonly outstandingUsd: string;

  constructor(
    private readonly db: DbService,
    config: ConfigService,
  ) {
    this.outstandingUsd = config.get<string>('PRICING_PARTY_OUTSTANDING_USD') ?? '25000';
  }

  async reserve(
    pair: PricingPair,
    notionalUsd: string,
    partyId: string,
    quote: ReservationQuote,
  ): Promise<ExposureReservation> {
    const notional = toScaled(notionalUsd, 18);

    if (notional > toScaled(pair.maxNotionalUsd, 18)) {
      throw new PlatformException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'NOTIONAL_OVER_MAX',
        `${pair.baseCcy}/${pair.quoteCcy} allows at most ${pair.maxNotionalUsd} USD of notional per quote`,
      );
    }

    const reservationId = await this.db.transaction(async (client) => {
      // Serialize this party's reservations: the cap query below and the
      // INSERT are one atomic unit, so no two requests can read the same
      // "used" and both slip under the cap.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`pricing:party:${partyId}`]);

      const { rows } = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(notional_usd), 0)::text AS total
         FROM quotes_issued
         WHERE party_id = $1
           AND (
             (status = 'RESERVED' AND created_at > now() - interval '60 seconds')
             OR (status = 'ISSUED' AND expires_at > now())
           )`,
        [partyId],
      );
      const used = toScaled(rows[0]?.total ?? '0', 18);
      if (used + notional > toScaled(this.outstandingUsd, 18)) {
        throw new PlatformException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'PARTY_OUTSTANDING_CAP_EXCEEDED',
          `party ${partyId} has ${format(used)} USD of outstanding notional; the cap is ${this.outstandingUsd}`,
        );
      }

      const { rows: inserted } = await client.query<{ reservation_id: string }>(
        `INSERT INTO quotes_issued
           (party_id, base, quote, from_amount, rate, spread_bps, notional_usd, sources, expires_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8::jsonb, now() + make_interval(secs => $9), 'RESERVED')
         RETURNING reservation_id`,
        [
          partyId,
          quote.base,
          quote.quote,
          quote.fromAmount,
          quote.rate,
          quote.spreadBps,
          notionalUsd,
          JSON.stringify(quote.sources),
          pair.ttlSeconds,
        ],
      );

      return inserted[0].reservation_id;
    });

    return new DbReservation(this.db, reservationId);
  }
}

/** A quotes_issued row reserved by the guard, waiting on the ledger. */
class DbReservation implements ExposureReservation {
  constructor(
    private readonly db: DbService,
    private readonly reservationId: string,
  ) {}

  async issue(quoteId: string, expiresAt: string): Promise<void> {
    await this.db.query(
      `UPDATE quotes_issued SET quote_id = $1, status = 'ISSUED', expires_at = $2 WHERE reservation_id = $3`,
      [quoteId, expiresAt, this.reservationId],
    );
  }

  async cancel(): Promise<void> {
    await this.db.query(`DELETE FROM quotes_issued WHERE reservation_id = $1`, [this.reservationId]);
  }
}

/** Renders a scaled-18 value back to a plain USD string for error text. */
function format(scaled: bigint): string {
  return (scaled / 10n ** 18n).toString();
}
