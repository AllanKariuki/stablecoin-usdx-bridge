import { Injectable } from '@nestjs/common';
import { Queryable } from '@damp/nest-platform';
import { DbService } from '../db/db.service';

/**
 * A pricing_pairs row: the policy a quote for this ordered pair mints
 * under — the spread the ledger applies, the quote's TTL, and the per-quote
 * notional ceiling the exposure guard enforces. Direction matters: a
 * USD/KES row and a KES/USD row are two different policies, because a
 * spread-bearing rate must never be inverted (that would quietly charge
 * the spread backwards — the same rule as core-ledger's UsableQuote).
 */
export interface PricingPair {
  baseCcy: string;
  quoteCcy: string;
  spreadBps: number;
  ttlSeconds: number;
  enabled: boolean;
  maxNotionalUsd: string;
  updatedAt: string;
  updatedBy: string;
}

export interface PairPatch {
  spreadBps?: number;
  ttlSeconds?: number;
  enabled?: boolean;
  maxNotionalUsd?: string;
}

interface PairRow {
  base_ccy: string;
  quote_ccy: string;
  spread_bps: number;
  ttl_seconds: number;
  enabled: boolean;
  max_notional_usd: string;
  updated_at: string;
  updated_by: string;
}

@Injectable()
export class PairsRepository {
  constructor(private readonly db: DbService) {}

  async list(): Promise<PricingPair[]> {
    const { rows } = await this.db.query<PairRow>('SELECT * FROM pricing_pairs ORDER BY base_ccy, quote_ccy');
    return rows.map(toPair);
  }

  async find(baseCcy: string, quoteCcy: string): Promise<PricingPair | null> {
    const { rows } = await this.db.query<PairRow>(
      'SELECT * FROM pricing_pairs WHERE base_ccy = $1 AND quote_ccy = $2',
      [baseCcy, quoteCcy],
    );
    return rows[0] ? toPair(rows[0]) : null;
  }

  /**
   * Applies a patch and returns the row with the one it replaced (null for
   * a first edit), on `q` so the audit event commits with it. The prior row
   * is locked so two concurrent edits cannot both report the same "before".
   */
  async update(
    baseCcy: string,
    quoteCcy: string,
    patch: PairPatch,
    updatedBy: string,
    q: Queryable = this.db,
  ): Promise<{ pair: PricingPair; previous: PricingPair | null }> {
    const prior = await q.query('SELECT * FROM pricing_pairs WHERE base_ccy = $1 AND quote_ccy = $2 FOR UPDATE', [
      baseCcy,
      quoteCcy,
    ]);
    const { rows } = await q.query(
      `UPDATE pricing_pairs
       SET spread_bps       = COALESCE($3, spread_bps),
           ttl_seconds      = COALESCE($4, ttl_seconds),
           enabled          = COALESCE($5, enabled),
           max_notional_usd = COALESCE($6, max_notional_usd),
           updated_at       = now(),
           updated_by       = $7
       WHERE base_ccy = $1 AND quote_ccy = $2
       RETURNING *`,
      [
        baseCcy,
        quoteCcy,
        patch.spreadBps ?? null,
        patch.ttlSeconds ?? null,
        patch.enabled ?? null,
        patch.maxNotionalUsd ?? null,
        updatedBy,
      ],
    );
    if (rows.length === 0) {
      throw new Error(`pricing pair ${baseCcy}/${quoteCcy} does not exist`);
    }
    return {
      pair: toPair(rows[0] as unknown as PairRow),
      previous: prior.rows[0] ? toPair(prior.rows[0] as unknown as PairRow) : null,
    };
  }
}

function toPair(row: PairRow): PricingPair {
  return {
    baseCcy: row.base_ccy,
    quoteCcy: row.quote_ccy,
    spreadBps: row.spread_bps,
    ttlSeconds: row.ttl_seconds,
    enabled: row.enabled,
    maxNotionalUsd: row.max_notional_usd,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}
