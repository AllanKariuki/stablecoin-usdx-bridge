import { Module } from '@nestjs/common';
import { DbExposureGuard } from './db-exposure.guard';
import { EXPOSURE_GUARD } from './exposure-guard';

// DbExposureGuard is bound under the EXPOSURE_GUARD token so the quotes
// flow never names a concrete class — tests substitute a programmable
// guard, and slice 3 can wrap rms without touching QuotesService.
@Module({
  providers: [{ provide: EXPOSURE_GUARD, useClass: DbExposureGuard }],
  exports: [EXPOSURE_GUARD],
})
export class ExposureModule {}
