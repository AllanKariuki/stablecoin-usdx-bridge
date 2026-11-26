/**
 * What a price feed produces.
 *
 * `mid` is a decimal string (never a float — see src/money/rate.ts) and
 * `at` is the moment the feed observed it, not the moment we polled: a feed
 * that answers instantly with an old price and one that answers slowly with
 * a current price are different situations, and the aggregator's staleness
 * rule is what tells them apart.
 */
export interface PriceObservation {
  mid: string;
  at: Date;
}

/**
 * The seam every real rate provider implements — the same interface + stub
 * position rms's CustodianProvider takes on vendors: no paid contracts,
 * sandbox only where free and self-service. What matters is that the
 * aggregator has more than one independent source per crypto symbol, so a
 * single lying or broken feed trips the breaker instead of setting the
 * price.
 */
export interface PriceFeed {
  /** The feed's name — also the token used in a quote's source string. */
  readonly name: string;
  /** The symbols this feed can price, e.g. ["BTC/USD", "ETH/USD"]. */
  readonly symbols: string[];
  /**
   * Fetches one observation per supported symbol in `symbols` it can price.
   * A feed-level failure (HTTP error, malformed body) throws; a symbol the
   * feed simply has no data for is omitted, and the aggregator's min-sources
   * rule is what turns that into a refusal to quote.
   */
  fetch(symbols: string[]): Promise<Map<string, PriceObservation>>;
}
