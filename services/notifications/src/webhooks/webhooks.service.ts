import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DbService } from '../db/db.service';

interface EndpointRow {
  id: string;
  party_id: string;
  url: string;
  secret: string;
  events: string[];
  consecutive_failures: number;
}

interface DeliveryRow {
  id: string;
  endpoint_id: string;
  event: string;
  payload: Record<string, unknown>;
  attempts: number;
  url: string;
  secret: string;
}

/**
 * Outbound webhooks, with HMAC signing.
 *
 * Queued and retried rather than sent inline, for two reasons: a subscriber's
 * slow endpoint must not hold up the in-app toast that fired the same event,
 * and the retry schedule has to outlive the request that produced it.
 *
 * The signing scheme is the one most subscribers already know how to verify
 * (Stripe's shape): `t=<unix>,v1=<hex hmac>` over `"<t>.<body>"`. Signing the
 * timestamp *with* the body is what makes a captured request unreplayable —
 * signing the body alone would let anyone who saw one legitimate call resend
 * it forever, and the signature would still verify.
 */
@Injectable()
export class WebhooksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhooksService.name);
  private timer: NodeJS.Timeout | null = null;

  /** Attempt budget before an endpoint's delivery is given up on. */
  private readonly maxAttempts = 8;

  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const seconds = this.config.get<number>('WEBHOOK_DRAIN_SECONDS', { infer: true }) ?? 10;
    this.timer = setInterval(() => void this.drain(), seconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Creates an endpoint and returns the secret — the only time it is legible. */
  async register(partyId: string, url: string, events: string[]): Promise<{ id: string; secret: string }> {
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO webhook_endpoints (id, party_id, url, secret, events) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [`whe_${randomUUID()}`, partyId, url, secret, events],
    );
    return { id: rows[0].id, secret };
  }

  async list(partyId: string) {
    const { rows } = await this.db.query<EndpointRow & { active: boolean; last_success_at: Date | null }>(
      'SELECT * FROM webhook_endpoints WHERE party_id = $1 ORDER BY created_at DESC',
      [partyId],
    );
    // The secret is never returned. A signing secret that can be re-read from
    // an API proves nothing, because anyone who can read it can forge the
    // signature — so it is shown exactly once, at creation.
    return rows.map((r) => ({
      id: r.id,
      url: r.url,
      events: r.events,
      active: r.active,
      lastSuccessAt: r.last_success_at?.toISOString() ?? null,
      consecutiveFailures: r.consecutive_failures,
    }));
  }

  async remove(partyId: string, id: string): Promise<boolean> {
    const { rows } = await this.db.query<{ id: string }>(
      'DELETE FROM webhook_endpoints WHERE id = $1 AND party_id = $2 RETURNING id',
      [id, partyId],
    );
    return rows.length > 0;
  }

  /** Queues one delivery per matching endpoint. */
  async enqueue(partyId: string, event: string, payload: Record<string, unknown>): Promise<void> {
    const { rows } = await this.db.query<EndpointRow>(
      // An empty events array means every event: a subscriber that wants
      // everything shouldn't have to enumerate a list that grows.
      `SELECT * FROM webhook_endpoints
        WHERE party_id = $1 AND active AND (cardinality(events) = 0 OR $2 = ANY(events))`,
      [partyId, event],
    );

    for (const endpoint of rows) {
      await this.db.query(
        `INSERT INTO webhook_deliveries (id, endpoint_id, event, payload) VALUES ($1,$2,$3,$4)`,
        [`whd_${randomUUID()}`, endpoint.id, event, JSON.stringify(payload)],
      );
    }
  }

  /**
   * Sends everything due.
   *
   * `FOR UPDATE SKIP LOCKED` so more than one replica can drain concurrently
   * without either blocking on the other or double-sending — the same pattern
   * core-ledger's outbox relay uses, for the same reason.
   */
  async drain(): Promise<number> {
    const { rows } = await this.db.query<DeliveryRow>(
      `UPDATE webhook_deliveries d
          SET attempts = d.attempts + 1, next_attempt_at = now() + interval '60 seconds'
         FROM webhook_endpoints e
        WHERE d.endpoint_id = e.id
          AND d.id IN (
              SELECT id FROM webhook_deliveries
               WHERE status = 'PENDING' AND next_attempt_at <= now()
               ORDER BY next_attempt_at
               FOR UPDATE SKIP LOCKED
               LIMIT 50)
      RETURNING d.id, d.endpoint_id, d.event, d.payload, d.attempts, e.url, e.secret`,
    );

    let delivered = 0;
    for (const row of rows) {
      const ok = await this.deliver(row);
      if (ok) delivered += 1;
    }
    return delivered;
  }

  private async deliver(row: DeliveryRow): Promise<boolean> {
    const body = JSON.stringify({
      id: row.id,
      event: row.event,
      created: new Date().toISOString(),
      data: row.payload,
    });
    const timestamp = Math.floor(Date.now() / 1000);

    try {
      const res = await fetch(row.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DAMP-Event': row.event,
          'X-DAMP-Signature': sign(row.secret, timestamp, body),
          // Subscribers are expected to dedupe on this. Retries send the same
          // id, by design.
          'X-DAMP-Delivery-Id': row.id,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        await this.db.query(
          `UPDATE webhook_deliveries SET status = 'DELIVERED', delivered_at = now(),
                  response_status = $2, last_error = '' WHERE id = $1`,
          [row.id, res.status],
        );
        await this.db.query(
          `UPDATE webhook_endpoints SET last_success_at = now(), consecutive_failures = 0 WHERE id = $1`,
          [row.endpoint_id],
        );
        return true;
      }
      await this.fail(row, `endpoint returned ${res.status}`, res.status);
      return false;
    } catch (err) {
      await this.fail(row, err instanceof Error ? err.message : String(err), null);
      return false;
    }
  }

  private async fail(row: DeliveryRow, reason: string, status: number | null): Promise<void> {
    // Exponential backoff with a ceiling. `attempts` is post-increment — the
    // claim above already counted this try.
    const backoffSeconds = Math.min(2 ** row.attempts * 30, 3600);
    const dead = row.attempts >= this.maxAttempts;

    await this.db.query(
      `UPDATE webhook_deliveries
          SET status = $2, last_error = $3, response_status = $4,
              next_attempt_at = now() + make_interval(secs => $5)
        WHERE id = $1`,
      [row.id, dead ? 'DEAD' : 'PENDING', reason.slice(0, 2000), status, backoffSeconds],
    );

    await this.db.query(
      `UPDATE webhook_endpoints
          SET last_failure_at = now(), consecutive_failures = consecutive_failures + 1,
              -- An endpoint that has failed 20 times in a row is gone, not
              -- busy. Deactivating stops this service spending its drain
              -- budget on a URL nobody is listening at.
              active = (consecutive_failures + 1) < 20
        WHERE id = $1`,
      [row.endpoint_id],
    );

    if (dead) {
      this.logger.error(`webhook delivery ${row.id} (${row.event}) exhausted its attempt budget`);
    }
  }
}

/**
 * `t=<unix>,v1=<hex>` over `"<timestamp>.<body>"`.
 *
 * Signing the timestamp together with the body is what makes a captured
 * request unreplayable: a subscriber rejects anything whose `t` is too old,
 * and an attacker cannot move `t` forward without invalidating `v1`. Signing
 * the body alone would let one captured legitimate call be resent forever
 * with a valid signature.
 */
export function sign(secret: string, timestamp: number, body: string): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

/**
 * The verification a subscriber performs, implemented here so it can be
 * tested — and so the documentation of the scheme is executable rather than
 * prose.
 *
 * `timingSafeEqual` rather than `===`: comparing HMACs with a short-circuiting
 * equality leaks, byte by byte, how much of a guess was correct.
 */
export function verify(secret: string, header: string, body: string, toleranceSeconds = 300): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest();
  let received: Buffer;
  try {
    received = Buffer.from(parts.v1 ?? '', 'hex');
  } catch {
    return false;
  }
  if (received.length !== expected.length) return false;
  return timingSafeEqual(expected, received);
}
