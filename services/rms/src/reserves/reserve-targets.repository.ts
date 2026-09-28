import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';

/**
 * A reserve target is policy: "keep at least 100% of circulation in cash,
 * plus this much buffer on top".
 *
 * It is not an accounting invariant — Leg B already checks that backing
 * equals issuance, and it either does or doesn't. This is the separate
 * question of whether the *composition* of that backing is inside mandate,
 * which is a number a treasury committee sets and changes.
 */
export interface ReserveTarget {
  currency: string;
  minRatioBps: number;
  bufferAmount: string;
  note: string;
}

interface TargetRow {
  currency: string;
  min_ratio_bps: number;
  buffer_amount: string;
  note: string;
}

@Injectable()
export class ReserveTargetsRepository {
  constructor(private readonly db: DbService) {}

  async list(): Promise<ReserveTarget[]> {
    const { rows } = await this.db.query<TargetRow>('SELECT * FROM reserve_targets ORDER BY currency');
    return rows.map(toTarget);
  }

  async find(currency: string): Promise<ReserveTarget | null> {
    const { rows } = await this.db.query<TargetRow>('SELECT * FROM reserve_targets WHERE currency = $1', [currency]);
    return rows[0] ? toTarget(rows[0]) : null;
  }

  async upsert(input: ReserveTarget): Promise<ReserveTarget> {
    const { rows } = await this.db.query<TargetRow>(
      `INSERT INTO reserve_targets (id, currency, min_ratio_bps, buffer_amount, note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (currency) DO UPDATE SET
         min_ratio_bps = EXCLUDED.min_ratio_bps,
         buffer_amount = EXCLUDED.buffer_amount,
         note          = EXCLUDED.note,
         updated_at    = now()
       RETURNING *`,
      [`target_${randomUUID()}`, input.currency, input.minRatioBps, input.bufferAmount, input.note],
    );
    return toTarget(rows[0]);
  }
}

function toTarget(row: TargetRow): ReserveTarget {
  return {
    currency: row.currency,
    minRatioBps: row.min_ratio_bps,
    bufferAmount: row.buffer_amount,
    note: row.note,
  };
}
