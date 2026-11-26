import { Controller, Get, HttpStatus, Logger, Query } from '@nestjs/common';
import { PlatformException, RequireServiceRole } from '@damp/nest-platform';
import { Aggregator, PricingRateError } from './aggregator';
import {
  HISTORY_SYMBOLS,
  formatChangePct,
  isCryptoCurrency,
  PriceHistoryService,
  PricePointRow,
  storedSymbol,
} from './price-history.service';
import { inverseRate, parseRate } from '../money/rate';

/**
 * The indicative rates board. It mints nothing and writes nothing — it is
 * the same aggregated mids the quote path stands behind, with the same
 * per-symbol status the quote path refuses on, so a console can show
 * "TRIPPED" before anyone's quote request explains it the hard way.
 *
 * GET /rates/history is the portal's chart endpoint: per-symbol points
 * converted into the requested base, from the price_points series the
 * aggregator writes (see price-history.service.ts).
 */
@Controller('rates')
export class RatesController {
  private readonly logger = new Logger(RatesController.name);

  constructor(
    private readonly aggregator: Aggregator,
    private readonly history: PriceHistoryService,
  ) {}

  @Get()
  @RequireServiceRole('pricing.read')
  async list(@Query('base') base?: string) {
    const normalized = (base ?? 'USD').toUpperCase();
    const board = this.statusesFor(normalized);
    if (normalized === 'USD') {
      await this.addChange24h(board.entries);
    }
    return board;
  }

  @Get('history')
  @RequireServiceRole('pricing.read')
  historyEndpoint(
    @Query('symbols') symbols?: string,
    @Query('range') range?: string,
    @Query('base') base?: string,
  ) {
    if (!symbols || !symbols.trim()) {
      throw new PlatformException(HttpStatus.UNPROCESSABLE_ENTITY, 'SYMBOLS_REQUIRED', 'symbols is a comma-separated list of currencies');
    }
    return this.history.history(
      symbols.split(','),
      range ?? '1D',
      base ?? 'USD',
    );
  }

  private statusesFor(base: string) {
    try {
      return this.aggregator.statusesFor(base);
    } catch (err) {
      if (err instanceof PricingRateError) {
        throw new PlatformException(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message);
      }
      throw err;
    }
  }

  /**
   * change_24h_pct, per board entry, from the recorded series: the newest
   * point against the newest point at or before 24h ago. Only the USD board
   * gets it — the stored series are the USD legs, so a cross-rate board's
   * change would need both legs composed at every point, which is the
   * history endpoint's job, not the board's.
   *
   * The percentage is computed on the *displayed* rate: a crypto entry
   * shows the inverted leg, and a change on the inverted value is not the
   * negation of the leg's own change.
   */
  private async addChange24h(entries: Array<{ currency: string; change_24h_pct?: string | null }>): Promise<void> {
    let pairs: Map<string, { latest: PricePointRow; prev: PricePointRow | null }>;
    try {
      pairs = await this.history.change24hMids([...HISTORY_SYMBOLS]);
    } catch (err) {
      // The board is served from memory and must not die with the history
      // table: "when history allows" includes "when the database is up".
      this.logger.warn(`change_24h_pct unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    for (const entry of entries) {
      const pair = pairs.get(storedSymbol(entry.currency));
      if (!pair || !pair.prev) continue;
      const invert = isCryptoCurrency(entry.currency);
      const displayed = (mid: string) => {
        const scaled = parseRate(mid);
        return invert ? inverseRate(scaled) : scaled;
      };
      entry.change_24h_pct = formatChangePct(displayed(pair.prev.mid), displayed(pair.latest.mid));
    }
  }
}
