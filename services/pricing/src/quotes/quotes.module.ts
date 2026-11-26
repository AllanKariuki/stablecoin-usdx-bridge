import { Module } from '@nestjs/common';
import { ExposureModule } from '../exposure/exposure.module';
import { PairsModule } from '../pairs/pairs.module';
import { RatesModule } from '../rates/rates.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [RatesModule, PairsModule, ExposureModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
