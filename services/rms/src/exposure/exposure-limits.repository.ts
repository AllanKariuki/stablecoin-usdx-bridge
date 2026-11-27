import { Injectable } from '@nestjs/common';
import { Queryable } from '@damp/nest-platform';
import { DbService } from '../db/db.service';

/**
 * An exposure limit is policy: "the house may run the BTC position at most
 * this short and this long".
 *
 * It is not an accounting invariant — the ledger's journal already says
 * what the position *is*. This is the separate question of whether the
 * position the next quote would produce is inside the mandate a treasury
 * committee set, which is the number the committee changes.
 *
 * Limits are decimal strings at the currency's own scale, read from NUMERIC
 * columns as strings and never coerced through a float.
 */
export interface ExposureLimit {
  currency: string;
  maxShort: string;
  maxLong: string;
  updatedBy: string;
  updatedAt: Date;
}

interface LimitRow {
  currency: string;
  max_short: string;
  max_long: string;
  updated_by: string;
  updated_at: Date;
}

@Injectable()
export class ExposureLimitsRepository {
  constructor(private readonly db: DbService) {}

  async list(): Promise<ExposureLimit[]> {
    const { rows } = await this.db.query<LimitRow>('SELECT * FROM exposure_limits ORDER BY currency');
    return rows.map(toLimit);
  }

  async find(currency: string): Promise<ExposureLimit | null> {
    const { rows } = await this.db.query<LimitRow>('SELECT * FROM exposure_limits WHERE currency = $1', [currency]);
    return rows[0] ? toLimit(rows[0]) : null;
  }

  /**
   * Sets a limit and returns it with the one it replaced (null for a first
   * one), on `q` so the audit event commits with it. The prior row is locked
   * so two concurrent edits cannot both report the same "before" — the same
   * shape as ReserveTargetsRepository.upsert.
   */
  async upsert(
    input: { currency: string; maxShort: string; maxLong: string; updatedBy: string },
    q: Queryable = this.db,
  ): Promise<{ limit: ExposureLimit; previous: ExposureLimit | null }> {
    const prior = await q.query('SELECT * FROM exposure_limits WHERE currency = $1 FOR UPDATE', [input.currency]);
    const { rows } = await q.query(
      `INSERT INTO exposure_limits (currency, max_short, max_long, updated_by)
       VALUES ($1, $2::numeric, $3::numeric, $4)
       ON CONFLICT (currency) DO UPDATE SET
         max_short  = EXCLUDED.max_short,
         max_long   = EXCLUDED.max_long,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()
       RETURNING *`,
      [input.currency, input.maxShort, input.maxLong, input.updatedBy],
    );
    return {
      limit: toLimit(rows[0] as unknown as LimitRow),
      previous: prior.rows[0] ? toLimit(prior.rows[0] as unknown as LimitRow) : null,
    };
  }
}

function toLimit(row: LimitRow): ExposureLimit {
  return {
    currency: row.currency,
    maxShort: row.max_short,
    maxLong: row.max_long,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}
