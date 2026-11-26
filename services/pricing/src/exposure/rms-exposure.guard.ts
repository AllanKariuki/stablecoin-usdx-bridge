import { PricingPair } from '../pairs/pairs.repository';
import { ExposureReservation, ReservationQuote } from './exposure-guard';

/**
 * The slice-3 seam: an exposure guard that consults rms before a quote is
 * minted — "does the platform's actual reserve position still support this
 * party being quoted this much USD" — on top of the caps DbExposureGuard
 * enforces locally.
 *
 * NOT implemented. Deliberately just the interface: slice 3 wires rms
 * (GET /reserves/status) into the quotes flow, and defining the shape now
 * is what keeps that a wiring change rather than a redesign. Until then,
 * DbExposureGuard is the only ExposureGuard.
 */
export interface RmsExposureGuard {
  reserve(
    pair: PricingPair,
    notionalUsd: string,
    partyId: string,
    quote: ReservationQuote,
  ): Promise<ExposureReservation>;
}
