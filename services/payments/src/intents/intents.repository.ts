import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';

export type IntentDirection = 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
export type IntentStatus = 'REQUIRES_ACTION' | 'PROCESSING' | 'SETTLED' | 'FAILED' | 'CANCELLED';

export interface PaymentIntent {
  id: string;
  partyId: string;
  direction: IntentDirection;
  amount: string;
  currency: string;
  walletId: string;
  bankAccountId: string | null;
  beneficiaryId: string | null;
  invoiceId: string | null;
  rail: string;
  railRef: string;
  status: IntentStatus;
  ledgerTxId: string;
  idempotencyKey: string;
  description: string;
  failureReason: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  settledAt: Date | null;
}

interface IntentRow {
  id: string;
  party_id: string;
  direction: IntentDirection;
  amount: string;
  currency: string;
  wallet_id: string;
  bank_account_id: string | null;
  beneficiary_id: string | null;
  invoice_id: string | null;
  rail: string;
  rail_ref: string;
  status: IntentStatus;
  ledger_tx_id: string;
  idempotency_key: string;
  description: string;
  failure_reason: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  settled_at: Date | null;
}

@Injectable()
export class IntentsRepository {
  constructor(private readonly db: DbService) {}

  /**
   * Creates an intent, or returns the existing one for this idempotency key.
   *
   * `ON CONFLICT DO UPDATE` on a no-op rather than `DO NOTHING`, because
   * `DO NOTHING` returns no row and the caller would then need a second query
   * — leaving a window where a concurrent request sees neither. Updating
   * `updated_at` is the cheapest way to make the conflict path still RETURN.
   */
  async create(input: {
    partyId: string;
    direction: IntentDirection;
    amount: string;
    currency: string;
    walletId: string;
    bankAccountId?: string | null;
    beneficiaryId?: string | null;
    invoiceId?: string | null;
    rail: string;
    idempotencyKey: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ intent: PaymentIntent; created: boolean }> {
    const { rows } = await this.db.query<IntentRow & { inserted: boolean }>(
      `INSERT INTO payment_intents
         (id, party_id, direction, amount, currency, wallet_id, bank_account_id,
          beneficiary_id, invoice_id, rail, idempotency_key, description, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = payment_intents.updated_at
       RETURNING *, (xmax = 0) AS inserted`,
      [
        `pi_${randomUUID()}`,
        input.partyId,
        input.direction,
        input.amount,
        input.currency,
        input.walletId,
        input.bankAccountId ?? null,
        input.beneficiaryId ?? null,
        input.invoiceId ?? null,
        input.rail,
        input.idempotencyKey,
        input.description ?? '',
        input.metadata ?? {},
      ],
    );
    return { intent: toIntent(rows[0]), created: rows[0].inserted };
  }

  async find(id: string): Promise<PaymentIntent | null> {
    const { rows } = await this.db.query<IntentRow>('SELECT * FROM payment_intents WHERE id = $1', [id]);
    return rows[0] ? toIntent(rows[0]) : null;
  }

  async findByRailRef(rail: string, railRef: string): Promise<PaymentIntent | null> {
    const { rows } = await this.db.query<IntentRow>(
      'SELECT * FROM payment_intents WHERE rail = $1 AND rail_ref = $2 ORDER BY created_at DESC LIMIT 1',
      [rail, railRef],
    );
    return rows[0] ? toIntent(rows[0]) : null;
  }

  async listForParty(partyId: string, limit = 50): Promise<PaymentIntent[]> {
    const { rows } = await this.db.query<IntentRow>(
      'SELECT * FROM payment_intents WHERE party_id = $1 ORDER BY created_at DESC LIMIT $2',
      [partyId, limit],
    );
    return rows.map(toIntent);
  }

  async recordRailAccepted(id: string, railRef: string, status: IntentStatus): Promise<void> {
    await this.db.query(
      `UPDATE payment_intents SET rail_ref = $2, status = $3, updated_at = now() WHERE id = $1`,
      [id, railRef, status],
    );
  }

  /**
   * Marks an intent settled, but only if it wasn't already.
   *
   * The `ledger_tx_id = ''` predicate is the idempotency guard for the whole
   * settlement path: a duplicate rail callback (which every real rail sends,
   * and the outbox pattern guarantees) updates zero rows and the caller knows
   * not to post a second journal transaction. Checking in application code
   * instead would leave a window between the read and the write that two
   * concurrent callbacks fit through.
   */
  async markSettled(id: string, ledgerTxId: string): Promise<boolean> {
    const { rows } = await this.db.query<{ id: string }>(
      `UPDATE payment_intents
          SET status = 'SETTLED', ledger_tx_id = $2, settled_at = now(),
              failure_reason = '', updated_at = now()
        WHERE id = $1 AND ledger_tx_id = ''
        RETURNING id`,
      [id, ledgerTxId],
    );
    return rows.length > 0;
  }

  async markFailed(id: string, reason: string): Promise<void> {
    // Never overwrites a settled intent. A late failure callback for money
    // that already landed must not un-settle it in this database while the
    // journal still says it moved.
    await this.db.query(
      `UPDATE payment_intents
          SET status = 'FAILED', failure_reason = $2, updated_at = now()
        WHERE id = $1 AND status NOT IN ('SETTLED', 'CANCELLED')`,
      [id, reason.slice(0, 2000)],
    );
  }

  async markCancelled(id: string, partyId: string): Promise<boolean> {
    const { rows } = await this.db.query<{ id: string }>(
      `UPDATE payment_intents SET status = 'CANCELLED', updated_at = now()
        WHERE id = $1 AND party_id = $2 AND status = 'REQUIRES_ACTION'
        RETURNING id`,
      [id, partyId],
    );
    return rows.length > 0;
  }
}

function toIntent(row: IntentRow): PaymentIntent {
  return {
    id: row.id,
    partyId: row.party_id,
    direction: row.direction,
    amount: row.amount,
    currency: row.currency,
    walletId: row.wallet_id,
    bankAccountId: row.bank_account_id,
    beneficiaryId: row.beneficiary_id,
    invoiceId: row.invoice_id,
    rail: row.rail,
    railRef: row.rail_ref,
    status: row.status,
    ledgerTxId: row.ledger_tx_id,
    idempotencyKey: row.idempotency_key,
    description: row.description,
    failureReason: row.failure_reason,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    settledAt: row.settled_at,
  };
}
