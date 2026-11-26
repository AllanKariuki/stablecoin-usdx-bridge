import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Queryable } from '@damp/nest-platform';
import { DbService } from '../db/db.service';

/**
 * The treasury desk's own record of each rebalance trade, beside the
 * journal entry it produced in core-ledger.
 *
 * The row is written AFTER the ledger call succeeds, and the ON CONFLICT
 * on ledger_tx_id is what makes the pair idempotent: a retry of the same
 * trade hits the same deterministic Idempotency-Key on the ledger (which
 * replays the original transaction) and then reconciles to the same row
 * here — a second trade is never recorded for one journal entry, and a
 * replayed trade is never audited twice.
 */
export interface TreasuryRebalance {
  id: string;
  side: 'BUY' | 'SELL';
  currency: string;
  amount: string;
  fiatCurrency: string;
  fiatAmount: string;
  custodianRef: string;
  note: string;
  ledgerTxId: string | null;
  createdBy: string;
  createdAt: Date;
}

interface RebalanceRow {
  id: string;
  side: 'BUY' | 'SELL';
  currency: string;
  amount: string;
  fiat_currency: string;
  fiat_amount: string;
  custodian_ref: string;
  note: string;
  ledger_tx_id: string | null;
  created_by: string;
  created_at: Date;
}

@Injectable()
export class TreasuryRebalancesRepository {
  constructor(private readonly db: DbService) {}

  async list(limit = 50): Promise<TreasuryRebalance[]> {
    const { rows } = await this.db.query<RebalanceRow>(
      `SELECT * FROM treasury_rebalances ORDER BY created_at DESC, id LIMIT $1`,
      [limit],
    );
    return rows.map(toRebalance);
  }

  /**
   * Records a posted trade on `q`, so the audit event commits with it. The
   * ON CONFLICT DO NOTHING returns no row on a replay of an already-recorded
   * ledger transaction — the caller treats that as "not new" and skips the
   * audit event rather than double-reporting.
   */
  async record(
    input: {
      side: 'BUY' | 'SELL';
      currency: string;
      amount: string;
      fiatCurrency: string;
      fiatAmount: string;
      custodianRef: string;
      note: string;
      ledgerTxId: string;
      createdBy: string;
    },
    q: Queryable = this.db,
  ): Promise<TreasuryRebalance | null> {
    const { rows } = await q.query(
      `INSERT INTO treasury_rebalances
         (id, side, currency, amount, fiat_currency, fiat_amount, custodian_ref, note, ledger_tx_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (ledger_tx_id) DO NOTHING
       RETURNING *`,
      [
        `rebal_${randomUUID()}`,
        input.side,
        input.currency,
        input.amount,
        input.fiatCurrency,
        input.fiatAmount,
        input.custodianRef,
        input.note,
        input.ledgerTxId,
        input.createdBy,
      ],
    );
    return rows[0] ? toRebalance(rows[0] as unknown as RebalanceRow) : null;
  }
}

function toRebalance(row: RebalanceRow): TreasuryRebalance {
  return {
    id: row.id,
    side: row.side,
    currency: row.currency,
    amount: row.amount,
    fiatCurrency: row.fiat_currency,
    fiatAmount: row.fiat_amount,
    custodianRef: row.custodian_ref,
    note: row.note,
    ledgerTxId: row.ledger_tx_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
