import { PricingPair } from '../pairs/pairs.repository';

/**
 * The quote fields the reservation row records. The ledger's quote id and
 * expiry are deliberately absent — they exist only once core-ledger has
 * minted the quote, which is exactly what a reservation is still waiting
 * for.
 */
export interface ReservationQuote {
  base: string;
  quote: string;
  fromAmount: string;
  rate: string;
  spreadBps: number;
  sources: string[];
}

/**
 * A held reservation: the guard has already counted this quote against the
 * party's outstanding cap and written a RESERVED row. The caller must
 * either `issue` it (core-ledger minted the quote) or `cancel` it (the
 * ledger call failed), so a reservation never outlives the attempt that
 * created it and a failed attempt never burns the cap.
 */
export interface ExposureReservation {
  issue(quoteId: string, expiresAt: string): Promise<void>;
  cancel(): Promise<void>;
}

/**
 * The exposure ceiling every quote must pass before a rate is minted.
 * `reserve` either resolves with a reservation handle (the quote may
 * proceed to core-ledger) or throws — the default implementation refuses
 * with 422 codes, and anything it throws means the core-ledger call never
 * happens.
 *
 * `notionalUsd` is the USD value of the quote's from_amount, a decimal
 * string; `partyId` is who the quote is pinned to. A quote pinned to one
 * party for one amount is bounded on its own — the guard is what bounds
 * the *series* of quotes a party can be minted, by reserving first so two
 * concurrent requests cannot both pass the cap before either is recorded.
 */
export interface ExposureGuard {
  reserve(
    pair: PricingPair,
    notionalUsd: string,
    partyId: string,
    quote: ReservationQuote,
  ): Promise<ExposureReservation>;
}

/** The DI token the quotes flow injects the guard under, so tests (and
 * slice 3) can substitute their own implementation. */
export const EXPOSURE_GUARD = 'EXPOSURE_GUARD';
