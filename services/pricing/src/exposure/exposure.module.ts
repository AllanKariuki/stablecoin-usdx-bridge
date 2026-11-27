import { Module } from '@nestjs/common';
import { DbExposureGuard } from './db-exposure.guard';
import { EXPOSURE_GUARD } from './exposure-guard';
import { RmsExposureGuard } from './rms-exposure.guard';

// The quotes flow injects one ExposureGuard. Since slice 3 that guard is
// RmsExposureGuard: it asks rms whether the house's crypto position can
// take the quote (POST /exposure/check, fail closed), then delegates to
// DbExposureGuard for the local per-quote and per-party caps — so the flow
// never names either concrete class, and tests substitute a programmable
// guard under the token as before.
@Module({
  providers: [
    DbExposureGuard,
    { provide: EXPOSURE_GUARD, useClass: RmsExposureGuard },
  ],
  exports: [EXPOSURE_GUARD],
})
export class ExposureModule {}
