import { Counter, Gauge, Registry } from 'prom-client';
import { Queryable } from './audit-event';

export interface PendingAuditEvent {
  id: string;
  eventId: string;
  action: string;
  payload: string;
  attempts: number;
}

export interface AuditPublisher {
  publish(event: PendingAuditEvent): Promise<void>;
  readonly target: string;
}

/**
 * A refusal retrying cannot change — a 4xx from audit-trail other than
 * 408/429. Dead-lettered at once rather than re-sent for hours.
 */
export class PermanentAuditError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`audit-trail refused the event (HTTP ${status}): ${body}`);
  }
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** POSTs to audit-trail's POST /internal/events. */
export class HttpAuditPublisher implements AuditPublisher {
  readonly target: string;

  constructor(
    baseUrl: string,
    private readonly token = '',
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 10_000,
  ) {
    this.target = `${baseUrl.replace(/\/+$/, '')}/internal/events`;
  }

  async publish(event: PendingAuditEvent): Promise<void> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      // The id is in the body too; the header is for logs and proxies.
      'idempotency-key': event.eventId,
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;

    const res = await this.fetchImpl(this.target, {
      method: 'POST',
      headers,
      body: event.payload,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    // 201 recorded, 200 already recorded under this id: both mean the trail has it.
    if (res.status >= 200 && res.status < 300) return;
    const body = (await res.text().catch(() => '')).slice(0, 2048).trim();
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      throw new PermanentAuditError(res.status, body);
    }
    throw new Error(`audit-trail returned ${res.status}: ${body}`);
  }
}

export interface AuditRelayLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface AuditRelayOptions {
  intervalMs?: number;
  batchSize?: number;
  visibilitySeconds?: number;
  backoffMinMs?: number;
  backoffMaxMs?: number;
  /** The service's PlatformMetricsService.registry, so the backlog is scraped with everything else. */
  registry?: Registry;
}

/**
 * Drains audit_outbox to audit-trail. Safe on every replica: the claim hands
 * each row to one of them.
 *
 * No attempt budget for transient failures, for the reason the Go relay has
 * none: giving up because audit-trail was down for an afternoon would put a
 * hole in the trail exactly where an outage was. The backlog gauge
 * (audit_outbox_pending_events) is the alarm; only an outright refusal is
 * dead-lettered.
 */
export class AuditRelay {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> = Promise.resolve();
  private readonly opts: Required<Omit<AuditRelayOptions, 'registry'>>;
  private readonly pending?: Gauge;
  private readonly delivered?: Counter<'action'>;
  private readonly dead?: Counter;

  constructor(
    private readonly db: Queryable,
    private readonly publisher: AuditPublisher,
    private readonly logger: AuditRelayLogger,
    options: AuditRelayOptions = {},
  ) {
    this.opts = {
      intervalMs: options.intervalMs ?? 2_000,
      batchSize: options.batchSize ?? 100,
      visibilitySeconds: options.visibilitySeconds ?? 60,
      backoffMinMs: options.backoffMinMs ?? 2_000,
      backoffMaxMs: options.backoffMaxMs ?? 300_000,
    };
    if (options.registry) {
      const registers = [options.registry];
      this.pending = new Gauge({
        name: 'audit_outbox_pending_events',
        help: 'Audit events committed with their action and not yet recorded by services/audit-trail.',
        registers,
      });
      this.delivered = new Counter({
        name: 'audit_outbox_delivered_total',
        help: 'Audit events services/audit-trail accepted, by action.',
        labelNames: ['action'],
        registers,
      });
      this.dead = new Counter({
        name: 'audit_outbox_dead_lettered_total',
        help: 'Audit events services/audit-trail refused outright. Each is a gap in the trail until a human looks.',
        registers,
      });
    }
  }

  start(): void {
    if (this.timer) return;
    this.logger.log(`audit relay started, delivering to ${this.publisher.target}`);
    this.timer = setInterval(() => {
      // One pass at a time: an interval firing during a slow pass would
      // otherwise claim a second batch alongside it.
      this.running = this.running.then(() =>
        this.runOnce().catch((err: unknown) =>
          this.logger.error(`audit relay pass failed: ${err instanceof Error ? err.message : String(err)}`),
        ),
      );
    }, this.opts.intervalMs);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  /** Claims and delivers one batch; returns how many were delivered. */
  async runOnce(): Promise<number> {
    if (this.pending) {
      // Every pass, empty or not: a gauge that only moves when there is work
      // goes silent exactly when the queue drains, and silence looks like a
      // dead relay.
      const { rows } = await this.db.query(`SELECT count(*)::int AS n FROM audit_outbox WHERE status = 'PENDING'`);
      this.pending.set(Number(rows[0]?.n ?? 0));
    }

    // The shape of core-ledger's outbox claim: SKIP LOCKED so concurrent
    // relays step over each other's rows, and next_attempt_at pushed forward
    // by the visibility window so a relay that dies holding rows releases
    // them without a heartbeat.
    const { rows } = await this.db.query(
      `UPDATE audit_outbox SET attempts = attempts + 1,
              next_attempt_at = now() + make_interval(secs => $2::double precision)
        WHERE id IN (
          SELECT id FROM audit_outbox
           WHERE status = 'PENDING' AND next_attempt_at <= now()
           ORDER BY next_attempt_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $1)
        RETURNING id, event_id, action, payload::text AS payload, attempts`,
      [this.opts.batchSize, this.opts.visibilitySeconds],
    );

    let delivered = 0;
    for (const row of rows) {
      const event: PendingAuditEvent = {
        id: String(row.id),
        eventId: String(row.event_id),
        action: String(row.action),
        payload: String(row.payload),
        attempts: Number(row.attempts),
      };
      try {
        await this.publisher.publish(event);
        await this.db.query(
          `UPDATE audit_outbox SET status = 'DELIVERED', delivered_at = now(), last_error = '' WHERE id = $1`,
          [event.id],
        );
        delivered++;
        this.delivered?.inc({ action: event.action });
      } catch (err) {
        const reason = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
        if (err instanceof PermanentAuditError) {
          this.logger.error(`audit-trail refused event ${event.eventId} (${event.action}); dead-lettered: ${reason}`);
          this.dead?.inc();
          await this.db.query(`UPDATE audit_outbox SET status = 'DEAD', last_error = $2 WHERE id = $1`, [
            event.id,
            reason,
          ]);
          continue;
        }
        const waitMs = fullJitter(this.opts.backoffMinMs, this.opts.backoffMaxMs, event.attempts);
        this.logger.warn(
          `audit event ${event.eventId} delivery failed (attempt ${event.attempts}); retrying in ${waitMs}ms: ${reason}`,
        );
        await this.db.query(
          `UPDATE audit_outbox SET next_attempt_at = now() + make_interval(secs => $2::double precision),
                  last_error = $3 WHERE id = $1`,
          [event.id, waitMs / 1000, reason],
        );
      }
    }
    return delivered;
  }
}

/**
 * Full-jitter exponential backoff: a uniform draw from
 * (0, min(max, min·2^(attempt-1))]. Every replica's relay failed at the same
 * moment audit-trail went down; without jitter they would all retry in
 * lockstep when it comes back.
 */
export function fullJitter(minMs: number, maxMs: number, attempt: number): number {
  const a = Math.max(1, attempt);
  const ceiling = Math.min(maxMs, minMs * 2 ** (a - 1));
  return Math.floor(Math.random() * ceiling) + 1;
}
