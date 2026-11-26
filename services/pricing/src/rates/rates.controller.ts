import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { PlatformException, RequireServiceRole } from '@damp/nest-platform';
import { Aggregator, PricingRateError } from './aggregator';

/**
 * The indicative rates board. It mints nothing and writes nothing — it is
 * the same aggregated mids the quote path stands behind, with the same
 * per-symbol status the quote path refuses on, so a console can show
 * "TRIPPED" before anyone's quote request explains it the hard way.
 */
@Controller('rates')
export class RatesController {
  constructor(private readonly aggregator: Aggregator) {}

  @Get()
  @RequireServiceRole('pricing.read')
  list(@Query('base') base?: string) {
    const normalized = (base ?? 'USD').toUpperCase();
    try {
      return this.aggregator.statusesFor(normalized);
    } catch (err) {
      if (err instanceof PricingRateError) {
        throw new PlatformException(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message);
      }
      throw err;
    }
  }
}
