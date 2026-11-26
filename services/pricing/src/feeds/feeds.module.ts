import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoinbaseFeed } from './coinbase.feed';
import { FiatFeed } from './fiat.feed';
import { KrakenFeed } from './kraken.feed';
import { PriceFeed } from './price-feed';
import { StubFeed } from './stub.feed';

/** The enabled feeds, built once from PRICING_FEEDS at boot. */
export const PRICE_FEEDS = 'PRICE_FEEDS';

/**
 * Turns PRICING_FEEDS (comma-separated names) into the live PriceFeed
 * instances the aggregator polls. An unknown name throws at boot — a typo
 * here means "no sources", and the only worse way to discover that is at
 * the first quote request.
 */
function buildFeeds(config: ConfigService): PriceFeed[] {
  const timeoutMs = config.get<number>('PRICING_FEED_TIMEOUT_MS', { infer: true }) ?? 5000;
  const names = (config.get<string>('PRICING_FEEDS') ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n !== '');

  return names.map((name) => {
    switch (name) {
      case 'coinbase':
        return new CoinbaseFeed(timeoutMs);
      case 'kraken':
        return new KrakenFeed(timeoutMs);
      case 'fiat':
        return new FiatFeed(config.get<string>('FIAT_FEED_URL', { infer: true })!, timeoutMs);
      case 'stub':
        return new StubFeed(config.get<string>('PRICING_STUB_RATES') ?? '');
      default:
        throw new Error(`PRICING_FEEDS names an unknown feed "${name}" (known: coinbase, kraken, fiat, stub)`);
    }
  });
}

@Module({
  providers: [
    {
      provide: PRICE_FEEDS,
      useFactory: buildFeeds,
      inject: [ConfigService],
    },
  ],
  exports: [PRICE_FEEDS],
})
export class FeedsModule {}
