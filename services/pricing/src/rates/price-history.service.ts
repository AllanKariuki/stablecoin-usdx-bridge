import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PlatformException } from '@damp/nest-platform';
import { DbService } from '../db/db.service';
import { formatRate, inverseRate, isQuotable, mulRate, parseRate } from '../money/rate';

/**
 * The price-history series (slice 4c): every poll's aggregated mid, retained
 * for charting, plus the endpoints that read it back.
 *
 * The store seam keeps the SQL in one class (PostgresPricePoints) and every
 * piece of logic above it — downsampling, base conversion, change
 * percentages — pure and unit-testable against an in-memory stand-in.
 * Arithmetic is fixed-point BigInt throughout, matching money/rate.ts; the
 * only floating-point-free output is the wire format.
 */

/** The feed symbols recorded after each poll: every crypto USD leg plus the
 * fiat USD legs. These are the series GET /rates/history converts between. */
export const HISTORY_SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'USD/EUR', 'USD/GBP', 'USD/KES'] as const;

const CRYPTO = new Set(['BTC', 'ETH', 'SOL']);

/** Whether a currency's stored series is its own USD leg (crypto) rather
 * than the USD leg the fiat feed observes. */
export function isCryptoCurrency(currency: string): boolean {
  return CRYPTO.has(currency);
}

/** The stored series key for a currency: crypto is its USD leg, fiat the USD
 * leg the feed observes. */
export function storedSymbol(currency: string): string {
  return isCryptoCurrency(currency) ? `${currency}/USD` : `USD/${currency}`;
}

/** Retention policy: minute buckets for 2 days, hourly (last per hour) to 400
 * days, nothing older. Constants, not config — see migrations/003_price_points.sql. */
export const RETAIN_MINUTES_MS = 2 * 24 * 60 * 60 * 1000;
export const RETAIN_TOTAL_MS = 400 * 24 * 60 * 60 * 1000;
export const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** The most points one series may carry on the wire. */
export const MAX_SERIES_POINTS = 300;

export interface PricePoint {
  t: string;
  price: string;
}

export interface HistorySeries {
  symbol: string;
  points: PricePoint[];
  /** (last-first)/first*100 over the returned points, as a 2-dp string —
   * null when the series has fewer than two points. */
  change_pct: string | null;
}

export interface RateHistory {
  base: string;
  range: string;
  series: HistorySeries[];
}

/** One price_points row as the store hands it back. mid is the NUMERIC
 * column, read as a decimal string. */
export interface PricePointRow {
  symbol: string;
  bucket: Date;
  mid: string;
  sources: string[];
}

/**
 * The price_points store. PostgresPricePoints is the production
 * implementation; tests substitute an in-memory one. All timestamps are
 * compared as instants — every bucket is a Date the store round-trips
 * through TIMESTAMPTZ.
 */
export abstract class PricePointsStore {
  abstract record(symbol: string, bucket: Date, mid: string, sources: string[]): Promise<void>;
  /** All rows for the symbols, bucket >= start when given, ascending. */
  abstract rows(symbols: string[], start?: Date): Promise<PricePointRow[]>;
  /** Per symbol: the newest row, and the newest row at or before cutoff. */
  abstract latestAndPrev(symbols: string[], cutoff: Date): Promise<Map<string, { latest: PricePointRow; prev: PricePointRow | null }>>;
  /** The retention pass (see the migration's header comment). */
  abstract retain(): Promise<void>;
}

@Injectable()
export class PostgresPricePoints implements PricePointsStore {
  constructor(private readonly db: DbService) {}

  async record(symbol: string, bucket: Date, mid: string, sources: string[]): Promise<void> {
    await this.db.query(
      `INSERT INTO price_points (symbol, bucket, mid, sources)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (symbol, bucket) DO UPDATE SET mid = EXCLUDED.mid, sources = EXCLUDED.sources`,
      [symbol, bucket, mid, sources],
    );
  }

  async rows(symbols: string[], start?: Date): Promise<PricePointRow[]> {
    const { rows } = await this.db.query<PricePointRow>(
      start
        ? `SELECT symbol, bucket, mid, sources FROM price_points
           WHERE symbol = ANY($1) AND bucket >= $2 ORDER BY symbol, bucket`
        : `SELECT symbol, bucket, mid, sources FROM price_points
           WHERE symbol = ANY($1) ORDER BY symbol, bucket`,
      start ? [symbols, start] : [symbols],
    );
    return rows;
  }

  async latestAndPrev(symbols: string[], cutoff: Date): Promise<Map<string, { latest: PricePointRow; prev: PricePointRow | null }>> {
    const { rows: latest } = await this.db.query<PricePointRow>(
      `SELECT DISTINCT ON (symbol) symbol, bucket, mid, sources FROM price_points
       WHERE symbol = ANY($1) ORDER BY symbol, bucket DESC`,
      [symbols],
    );
    const { rows: prev } = await this.db.query<PricePointRow>(
      `SELECT DISTINCT ON (symbol) symbol, bucket, mid, sources FROM price_points
       WHERE symbol = ANY($1) AND bucket <= $2 ORDER BY symbol, bucket DESC`,
      [symbols, cutoff],
    );
    const prevBySymbol = new Map(prev.map((r) => [r.symbol, r]));
    const out = new Map<string, { latest: PricePointRow; prev: PricePointRow | null }>();
    for (const row of latest) {
      out.set(row.symbol, { latest: row, prev: prevBySymbol.get(row.symbol) ?? null });
    }
    return out;
  }

  async retain(): Promise<void> {
    // Oldest first: rows past the total window go outright, then what is
    // older than the minute window collapses to the last point per hour.
    await this.db.query(`DELETE FROM price_points WHERE bucket < now() - $1::interval`, [`${RETAIN_TOTAL_MS} milliseconds`]);
    await this.db.query(
      `DELETE FROM price_points p
       WHERE p.bucket < now() - $1::interval
         AND EXISTS (
           SELECT 1 FROM price_points n
           WHERE n.symbol = p.symbol
             AND date_trunc('hour', n.bucket) = date_trunc('hour', p.bucket)
             AND n.bucket > p.bucket
         )`,
      [`${RETAIN_MINUTES_MS} milliseconds`],
    );
  }
}

const RANGE_DURATION_MS: Record<string, number> = {
  '1H': 60 * 60 * 1000,
  '1D': 24 * 60 * 60 * 1000,
  '1W': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
  '1Y': 365 * 24 * 60 * 60 * 1000,
};

/** floorToMinute is the bucket key: every observation lands in its own
 * minute's row, and a later poll in the same minute overwrites it. */
export function floorToMinute(t: Date): Date {
  return new Date(Math.floor(t.getTime() / 60000) * 60000);
}

/**
 * downsample keeps the first and last points and spreads max evenly-spaced
 * picks between them — index-space sampling, so the shape of the series
 * (gaps and all) survives. Returns at most max points.
 */
export function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const picked = new Set<number>();
  for (let i = 0; i < max; i++) {
    picked.add(Math.floor((i * (points.length - 1)) / (max - 1)));
  }
  return [...picked].map((i) => points[i]);
}

/**
 * changePctScaled is ((last-first)/first)*100, in hundredths of a percent:
 * the scaled integer the 2-dp string is rendered from. Null when the first
 * price is not positive — there is no percentage off a zero base.
 */
export function changePctScaled(first: bigint, last: bigint): bigint | null {
  if (first <= 0n) return null;
  return ((last - first) * 10000n) / first;
}

/** formatChangePct renders changePctScaled as an exactly-2-dp string
 * ("1.25", "-0.07"), truncating toward zero like every other division here. */
export function formatChangePct(first: bigint, last: bigint): string | null {
  const scaled = changePctScaled(first, last);
  if (scaled === null) return null;
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/**
 * PriceHistoryService records the aggregator's OK symbols and serves the
 * history endpoint. The retention job runs at boot and daily — the boot
 * pass keeps a database that predates the feature from growing unboundedly
 * before the first tick.
 */
@Injectable()
export class PriceHistoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PriceHistoryService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly store: PricePointsStore) {}

  onModuleInit(): void {
    void this.retain().catch((err: unknown) =>
      this.logger.warn(`boot retention failed: ${err instanceof Error ? err.message : String(err)}`),
    );
    this.timer = setInterval(
      () => void this.retain().catch((err: unknown) => this.logger.warn(`retention failed: ${err instanceof Error ? err.message : String(err)}`)),
      RETENTION_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** The aggregator's write path: the current aggregated mid for one symbol,
   * keyed to the observation's own minute. */
  async record(symbol: string, at: Date, mid: bigint, sources: string[]): Promise<void> {
    await this.store.record(symbol, floorToMinute(at), formatRate(mid), sources);
  }

  async retain(): Promise<void> {
    await this.store.retain();
  }

  /**
   * The series for GET /rates/history. Every point is the price of one
   * `symbol` in `base`, converted through the two USD legs at the point's
   * own time — the base leg contributes the point whose bucket is closest to
   * the point's (tie: the earlier one, so a chart never uses lookahead).
   */
  async history(symbols: string[], range: string, base = 'USD'): Promise<RateHistory> {
    const normalizedBase = base.toUpperCase();
    if (!isQuotable(normalizedBase)) {
      throw new PlatformException(HttpStatus.UNPROCESSABLE_ENTITY, 'UNSUPPORTED_PAIR', `${normalizedBase} is not a quotable base currency`);
    }
    const normalizedRange = (range ?? '').toUpperCase();
    if (normalizedRange !== 'ALL' && !(normalizedRange in RANGE_DURATION_MS)) {
      throw new PlatformException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_RANGE',
        `range must be one of 1H, 1D, 1W, 1M, 1Y, ALL — not ${range ?? ''}`,
      );
    }

    const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()))];
    for (const symbol of unique) {
      if (!isQuotable(symbol) || symbol === 'USD' || symbol === normalizedBase) {
        throw new PlatformException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'UNSUPPORTED_PAIR',
          `${symbol} cannot be charted against ${normalizedBase}: a series is a pair of two different quotable currencies, neither of them USD itself`,
        );
      }
    }

    const start = normalizedRange === 'ALL' ? undefined : new Date(Date.now() - RANGE_DURATION_MS[normalizedRange]);
    const now = Date.now();

    // The base leg: USD/base at the requested points' times. A fiat leg
    // refreshes daily, so its closest point may predate a short window — it
    // is fetched in full (retention bounds it); a crypto leg is minute-level
    // and fetched from the window's start.
    let leg: PricePointRow[] | null = null;
    if (normalizedBase !== 'USD') {
      const legRows = await this.store.rows([storedSymbol(normalizedBase)], isCryptoCurrency(normalizedBase) ? start : undefined);
      leg = legRows.filter((r) => r.bucket.getTime() <= now);
    }

    const series: HistorySeries[] = [];
    for (const symbol of unique) {
      const rows = (await this.store.rows([storedSymbol(symbol)], start)).filter((r) => r.bucket.getTime() <= now);
      const points = rows
        .map((row) => toBasePoint(row, symbol, normalizedBase, leg))
        .filter((p): p is PricePoint => p !== null);
      const sampled = downsample(points, MAX_SERIES_POINTS);
      series.push({
        symbol,
        points: sampled,
        change_pct: changePctOf(sampled),
      });
    }
    return { base: normalizedBase, range: normalizedRange, series };
  }

  /**
   * The raw mids behind the rates board's change_24h_pct, keyed by stored
   * symbol: the newest point and the newest point at or before 24h ago.
   * Callers decide the display transform (a crypto leg's displayed rate is
   * its inverse) before computing the percentage.
   */
  async change24hMids(symbols: string[]): Promise<Map<string, { latest: PricePointRow; prev: PricePointRow | null }>> {
    return this.store.latestAndPrev(symbols, new Date(Date.now() - RANGE_DURATION_MS['1D']));
  }
}

/** One row of the symbol's series, converted to the base at the row's own
 * time; null when the base leg has no point to convert with. */
function toBasePoint(row: PricePointRow, symbol: string, base: string, leg: PricePointRow[] | null): PricePoint | null {
  const usdPrice = isCryptoCurrency(symbol) ? parseRate(row.mid) : inverseRate(parseRate(row.mid));
  if (base === 'USD') {
    return { t: row.bucket.toISOString(), price: formatRate(usdPrice) };
  }

  const legRow = closestByBucket(leg ?? [], row.bucket.getTime());
  if (!legRow) return null;
  const legRate = isCryptoCurrency(base) ? inverseRate(parseRate(legRow.mid)) : parseRate(legRow.mid);
  return { t: row.bucket.toISOString(), price: formatRate(mulRate(usdPrice, legRate)) };
}

/** The row whose bucket is closest to t; ties go to the earlier row, so a
 * point never borrows a price from after its own time. `rows` is ascending. */
export function closestByBucket(rows: PricePointRow[], t: number): PricePointRow | null {
  if (rows.length === 0) return null;
  let lo = 0;
  let hi = rows.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].bucket.getTime() <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (ans === -1) return rows[0];
  if (ans + 1 < rows.length) {
    const prev = rows[ans];
    const next = rows[ans + 1];
    return t - prev.bucket.getTime() <= next.bucket.getTime() - t ? prev : next;
  }
  return rows[ans];
}

function changePctOf(points: PricePoint[]): string | null {
  if (points.length < 2) return null;
  return formatChangePct(parseRate(points[0].price), parseRate(points[points.length - 1].price));
}
