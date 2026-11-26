import { Module } from '@nestjs/common';
import { FeedsModule } from '../feeds/feeds.module';
import { Aggregator } from './aggregator';
import { PostgresPricePoints, PriceHistoryService, PricePointsStore } from './price-history.service';
import { RatesController } from './rates.controller';

@Module({
  imports: [FeedsModule],
  controllers: [RatesController],
  providers: [Aggregator, PriceHistoryService, { provide: PricePointsStore, useClass: PostgresPricePoints }],
  exports: [Aggregator],
})
export class RatesModule {}
