import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService, Queryable } from '../db/db.service';

/**
 * The events payments tells notifications about. The names are the template
 * keys notifications already has rows for (see its 001 migration), so
 * changing one here is a template migration there.
 */
export type PaymentEventName = 'payment.settled' | 'payment.failed' | 'invoice.issued';

export interface PaymentEvent {
  event: PaymentEventName;
  /** Who is told. Empty would mean an operator broadcast; payments never sends one. */
  partyId: string;
  payload: Record<string, unknown>;
}

export interface OutboxRow {
  id: string;
  event: PaymentEventName;
  party_id: string;
  payload: Record<string, unknown>;
  attempts: number;
}

@Injectable()
export class OutboxRepository {
  constructor(private readonly db: DbService) {}

  /**
   * Writes one event. `q` must be the transaction that makes the state change
   * the event describes — that is the entire point of the table. Called on
   * the pool directly it would be no better than the best-effort POST it
   * replaced.
   */
  async enqueue(q: Queryable, e: PaymentEvent): Promise<string> {
    const id = `evt_${randomUUID()}`;
    await q.query(`INSERT INTO outbox (id, event, party_id, payload) VALUES ($1,$2,$3,$4)`, [
      id,
      e.event,
      e.partyId,
      JSON.stringify(e.payload),
    ]);
    return id;
  }

  /**
   * Claims up to `limit` due rows for this relay.
   *
   * `FOR UPDATE SKIP LOCKED` so every payments replica can run a relay without
   * blocking on, or double-sending, another's rows. Claiming bumps `attempts`
   * and pushes `next_attempt_at` out by the lease, so a relay that dies
   * mid-delivery leaves its rows due again once the lease runs out instead of
   * stuck — the same claim notifications' webhook drain and core-ledger's
   * outbox use.
   */
  async claim(limit: number, leaseSeconds: number): Promise<OutboxRow[]> {
    const { rows } = await this.db.query<OutboxRow>(
      `UPDATE outbox
          SET attempts = attempts + 1, next_attempt_at = now() + make_interval(secs => $2)
        WHERE id IN (
              SELECT id FROM outbox
               WHERE status = 'PENDING' AND next_attempt_at <= now()
               ORDER BY next_attempt_at
               FOR UPDATE SKIP LOCKED
               LIMIT $1)
      RETURNING id, event, party_id, payload, attempts`,
      [limit, leaseSeconds],
    );
    return rows;
  }

  /** Rows not yet delivered — the backlog the relay's gauge reports. */
  async pendingCount(): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM outbox WHERE status = 'PENDING'`);
    return Number(rows[0]?.n ?? 0);
  }

  async markPublished(id: string): Promise<void> {
    await this.db.query(
      `UPDATE outbox SET status = 'PUBLISHED', published_at = now(), last_error = '' WHERE id = $1`,
      [id],
    );
  }

  /** Schedules another attempt, or gives up on the row when `dead`. */
  async markFailed(id: string, reason: string, retryInSeconds: number, dead: boolean): Promise<void> {
    await this.db.query(
      `UPDATE outbox
          SET status = $2, last_error = $3, next_attempt_at = now() + make_interval(secs => $4)
        WHERE id = $1`,
      [id, dead ? 'DEAD' : 'PENDING', reason.slice(0, 2000), retryInSeconds],
    );
  }
}
