import { Module } from '@nestjs/common';
import { FeedsModule } from '../feeds/feeds.module';
import { Aggregator } from './aggregator';
import { RatesController } from './rates.controller';

@Module({
  imports: [FeedsModule],
  controllers: [RatesController],
  providers: [Aggregator],
  exports: [Aggregator],
})
export class RatesModule {}
