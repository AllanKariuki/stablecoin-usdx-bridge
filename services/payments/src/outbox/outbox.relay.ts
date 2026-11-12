import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformMetricsService } from '@damp/nest-platform';
import { Counter, Gauge } from 'prom-client';
import { OutboxRepository, OutboxRow } from './outbox.repository';

/** How long a claimed row is hidden from other relays while one delivers it. */
const LEASE_SECONDS = 60;
const BATCH_SIZE = 50;
/** Ceiling on the gap between attempts. Past this, waiting longer buys nothing. */
const MAX_BACKOFF_SECONDS = 300;

/**
 * Delivers payments' outbox to services/notifications.
 *
 * At-least-once, on purpose. A relay that dies between notifications
 * accepting an event and the row being marked PUBLISHED sends it again; the
 * row id travels as `dedupeKey` and notifications' delivery log is UNIQUE on
 * it, so the customer is told once.
 *
 * Two triggers: a timer, which is what makes the outbox durable (a row nobody
 * kicked is still found), and `kick()` after every commit that wrote one,
 * which is what keeps the toast arriving while the customer's page is still
 * open rather than up to a timer tick later.
 */
@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private readonly baseUrl: string;
  private readonly intervalSeconds: number;
  private readonly maxAttempts: number;
  private timer: NodeJS.Timeout | null = null;

  /** One drain at a time per process; a kick during a drain asks for another pass. */
  private draining: Promise<void> | null = null;
  private again = false;

  private readonly delivered?: Counter<'event'>;
  private readonly dead?: Counter<'event'>;

  constructor(
    private readonly outbox: OutboxRepository,
    config: ConfigService,
    @Optional() metrics?: PlatformMetricsService,
  ) {
    this.baseUrl = config.get<string>('NOTIFICATIONS_URL', { infer: true }) ?? '';
    this.intervalSeconds = Number(config.get('OUTBOX_RELAY_SECONDS', { infer: true }) ?? 5);
    this.maxAttempts = Number(config.get('OUTBOX_MAX_ATTEMPTS', { infer: true }) ?? 100);

    // Named after the audit relay's audit_outbox_* metrics, on the same
    // registry /metrics serves. A DEAD row used to be a log line and nothing
    // else: a customer who was never told their payment landed, findable
    // only by someone already grepping for it.
    if (metrics) {
      const registers = [metrics.registry];
      const outbox = this.outbox;
      new Gauge({
        name: 'payments_outbox_pending_events',
        help: 'Payment events committed with their state change and not yet delivered to services/notifications.',
        registers,
        // Read at scrape time rather than set by the relay: with
        // NOTIFICATIONS_URL unset the relay never runs, and that is exactly
        // when the backlog grows.
        async collect() {
          this.set(await outbox.pendingCount());
        },
      });
      this.delivered = new Counter({
        name: 'payments_outbox_delivered_total',
        help: 'Payment events services/notifications accepted, by event.',
        labelNames: ['event'],
        registers,
      });
      this.dead = new Counter({
        name: 'payments_outbox_dead_lettered_total',
        help: 'Payment events given up on (refused, or out of attempts), by event. Each is a customer who was not told.',
        labelNames: ['event'],
        registers,
      });
    }
  }

  onModuleInit(): void {
    if (!this.baseUrl) {
      // A supported state, not a broken one: events accumulate in the outbox
      // and are delivered once a destination is configured. Dropping them
      // because nobody was listening yet is what the table exists to prevent.
      this.logger.warn('NOTIFICATIONS_URL is unset; payment events will queue in the outbox undelivered');
      return;
    }
    this.timer = setInterval(() => this.kick(), this.intervalSeconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Asks for a drain soon. Never throws, never blocks the caller. */
  kick(): void {
    if (!this.baseUrl) return;
    void this.drain().catch((err) =>
      this.logger.error(`outbox drain failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  /**
   * Delivers everything due. Resolves once this process has no drain running,
   * which is what lets tests await a deterministic end state.
   */
  async drain(): Promise<void> {
    if (this.draining) {
      this.again = true;
      return this.draining;
    }
    this.draining = (async () => {
      try {
        do {
          this.again = false;
          let batch: OutboxRow[];
          do {
            batch = await this.outbox.claim(BATCH_SIZE, LEASE_SECONDS);
            for (const row of batch) await this.deliver(row);
          } while (batch.length === BATCH_SIZE);
        } while (this.again);
      } finally {
        this.draining = null;
      }
    })();
    return this.draining;
  }

  private async deliver(row: OutboxRow): Promise<void> {
    let status: number | null = null;
    let reason: string;
    try {
      const res = await fetch(new URL('/internal/events', this.baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': row.id },
        body: JSON.stringify({ event: row.event, partyId: row.party_id, payload: row.payload, dedupeKey: row.id }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        await this.outbox.markPublished(row.id);
        this.delivered?.inc({ event: row.event });
        return;
      }
      status = res.status;
      reason = `notifications returned ${res.status}`;
    } catch (err) {
      reason = `notifications unreachable: ${err instanceof Error ? err.message : String(err)}`;
    }

    // A 4xx (other than timeout/throttling) is notifications saying this
    // event is malformed and always will be; retrying it for eight hours
    // changes nothing. Everything else — 5xx, refused, timed out — is
    // "notifications is down", which is exactly the case the outbox exists
    // to ride out.
    const permanent = status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429;
    const dead = permanent || row.attempts >= this.maxAttempts;
    await this.outbox.markFailed(row.id, reason, backoffSeconds(row.attempts), dead);

    if (dead) {
      this.dead?.inc({ event: row.event });
      this.logger.error(
        `outbox event ${row.id} (${row.event} for ${row.party_id}) is DEAD after ${row.attempts} attempt(s): ${reason}`,
      );
    } else {
      this.logger.warn(`outbox event ${row.id} (${row.event}) not delivered, will retry: ${reason}`);
    }
  }
}

/**
 * 1s, 2s, 4s … capped at five minutes. `attempts` is post-claim, so the first
 * failure waits one second. With the default budget of 100 attempts that is
 * roughly eight hours of notifications being unreachable before a row is
 * given up on — long enough to outlast a bad deploy or a night, short enough
 * that a DEAD row still means something.
 */
export function backoffSeconds(attempts: number): number {
  return Math.min(2 ** Math.max(attempts - 1, 0), MAX_BACKOFF_SECONDS);
}
