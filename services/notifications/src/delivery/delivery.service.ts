import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';
import { render } from '../templates/render';
import { LiveFanout } from '../ws/live-fanout';
import { WebhooksService } from '../webhooks/webhooks.service';
import { EmailTransport } from './email.transport';

export interface NotifyRequest {
  /** Empty means "everyone watching" — an operator broadcast. */
  partyId: string;
  event: string;
  payload: Record<string, unknown>;
  /**
   * The producer's idempotency key. An outbox is at-least-once by design, so
   * the same event arrives more than once as a matter of routine, and a
   * customer told twice that their money arrived is a support ticket.
   */
  dedupeKey?: string;
}

interface TemplateRow {
  id: string;
  event: string;
  channel: 'IN_APP' | 'EMAIL' | 'WEBHOOK';
  subject: string;
  body: string;
  severity: string;
}

/** What re-sending a stranded row needs, all of which the row itself holds. */
interface PendingRow {
  id: string;
  party_id: string;
  event: string;
  channel: TemplateRow['channel'];
  subject: string;
  body: string;
  severity: string;
  payload: Record<string, unknown>;
}

interface Claimed {
  id: string;
  subject: string;
  body: string;
}

/**
 * Turning an event into messages.
 *
 * Three things happen per event, in this order and for this reason:
 *
 *  1. **The delivery row is written first**, before anything is sent. A
 *     notification that was sent but not recorded is one nobody can prove
 *     happened; a notification recorded but not sent is visibly PENDING and
 *     recoverable. In a dispute, "did they know" is a different question from
 *     "did it happen", and this table is the only answer to the first.
 *  2. The channel transport runs.
 *  3. The row is updated with the outcome.
 *
 * A send failing never throws at the caller — it is recorded as FAILED.
 * Every producer in this platform calls notifications best-effort, because a
 * notification that fails to send must never fail a settlement that already
 * happened. What does throw is the database being unreachable, because then
 * nothing was recorded and the producer's retry is the only copy left.
 *
 * **A crash between 1 and 3 leaves the row PENDING**, and "recoverable" has to
 * mean somebody recovers it. Each PENDING row carries a lease (`claimed_at`);
 * once that is older than the longest a send can take
 * (`PENDING_STALE_SECONDS`), the row was abandoned and may be taken again — by
 * the producer's replay, which reclaims it in the same statement that would
 * otherwise have been a duplicate no-op, or by the sweeper, which finds it
 * with nobody's help. Taking the lease is one conditional UPDATE, so two
 * replicas cannot both re-send the same row. `PENDING_MAX_ATTEMPTS` bounds
 * how often, after which the row is marked FAILED rather than retried forever.
 *
 * A reclaimed send is at-least-once on the channel: if the crash came after
 * the transport accepted the message but before the row was updated, the
 * customer gets it twice. That is the right side to err on — a duplicate
 * toast is a nuisance; a reconciliation alert nobody saw is the failure this
 * service exists to prevent.
 */
@Injectable()
export class DeliveryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DeliveryService.name);
  private readonly staleSeconds: number;
  private readonly maxAttempts: number;
  private readonly sweepSeconds: number;
  private readonly horizonHours: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: DbService,
    private readonly live: LiveFanout,
    private readonly email: EmailTransport,
    private readonly webhooks: WebhooksService,
    @Optional() config?: ConfigService,
  ) {
    const num = (key: string, fallback: number) => Number(config?.get(key) ?? fallback);
    this.staleSeconds = num('PENDING_STALE_SECONDS', 120);
    this.maxAttempts = num('PENDING_MAX_ATTEMPTS', 5);
    this.sweepSeconds = num('PENDING_SWEEP_SECONDS', 30);
    this.horizonHours = num('PENDING_SWEEP_HORIZON_HOURS', 24);
  }

  /** After bootstrap, not module init: the sweep reads columns a migration adds. */
  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      this.sweep().catch((err) =>
        this.logger.warn(`pending sweep failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    }, this.sweepSeconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async notify(req: NotifyRequest): Promise<{ delivered: number; suppressed: number }> {
    const templates = await this.templatesFor(req.event);

    if (templates.length === 0) {
      // Not an error. A platform emits more events than it has messages for,
      // and an unrecognised event is a template somebody hasn't written yet —
      // not a failure of the producer. Logged at debug so it is findable
      // without being noise.
      this.logger.debug(`no template for ${req.event}; nothing to send`);
      return { delivered: 0, suppressed: 0 };
    }

    let delivered = 0;
    let suppressed = 0;

    for (const template of templates) {
      const enabled = await this.isEnabled(req.partyId, req.event, template.channel);
      if (!enabled) {
        suppressed += 1;
        await this.record(req, template, 'SUPPRESSED', '', 0);
        continue;
      }

      const subject = render(template.subject, req.payload);
      const body = render(template.body, req.payload);

      const claimed = await this.record(req, template, 'PENDING', '', 0, subject, body);
      if (!claimed) {
        // The dedupe key collided with a row that is already SENT or FAILED,
        // or PENDING under a live lease: this exact notification has already
        // been produced, or is being produced right now. Silently correct —
        // it is what at-least-once delivery looks like from the receiving end.
        continue;
      }

      if (await this.send(req, template, claimed)) delivered += 1;
    }

    // Webhooks are queued rather than sent inline: a subscriber's slow
    // endpoint must not hold up an in-app toast, and the retry schedule needs
    // to outlive this request anyway.
    if (req.partyId) {
      await this.webhooks.enqueue(req.partyId, req.event, req.payload, req.dedupeKey);
    }

    return { delivered, suppressed };
  }

  /**
   * Re-sends PENDING rows whose lease has lapsed, and gives up on the ones
   * that have used their attempts or are too old to be worth sending.
   *
   * This is what makes the row, rather than the producer, the durable record
   * of work: a stranded row is retried even if its event is never replayed —
   * because the producer was already told "accepted", or gave up. Returns how
   * many rows it took.
   */
  async sweep(batch = 50): Promise<number> {
    // Past the horizon a "your payment completed" is noise, not news; past the
    // attempt budget the row is more likely the cause of the crashes than a
    // victim of them. Either way FAILED is the honest status — still in the
    // log, still findable, no longer pretending to be in flight.
    const { rows: abandoned } = await this.db.query<{ id: string; attempts: number }>(
      `UPDATE deliveries
          SET status = 'FAILED',
              failure_reason = CASE WHEN attempts >= $2
                                    THEN 'abandoned: still PENDING after ' || attempts || ' attempts'
                                    ELSE 'abandoned: PENDING past the sweep horizon' END
        WHERE status = 'PENDING'
          AND claimed_at < now() - make_interval(secs => $1)
          AND (attempts >= $2 OR created_at < now() - make_interval(hours => $3))
        RETURNING id, attempts`,
      [this.staleSeconds, this.maxAttempts, this.horizonHours],
    );
    for (const row of abandoned) {
      this.logger.error(`delivery ${row.id} abandoned while PENDING after ${row.attempts} attempts; marked FAILED`);
    }

    // SKIP LOCKED so two replicas sweeping at once take disjoint rows. The
    // UPDATE moves the lease forward, so a replay arriving mid-send sees a
    // live lease and leaves the row alone.
    const { rows } = await this.db.query<PendingRow>(
      `WITH due AS (
         SELECT id FROM deliveries
          WHERE status = 'PENDING' AND claimed_at < now() - make_interval(secs => $1) AND attempts < $2
          ORDER BY claimed_at
          LIMIT $3
          FOR UPDATE SKIP LOCKED
       )
       UPDATE deliveries d
          SET claimed_at = now(), attempts = d.attempts + 1
         FROM due
        WHERE d.id = due.id
       RETURNING d.id, d.party_id, d.event, d.channel, d.subject, d.body, d.severity, d.payload`,
      [this.staleSeconds, this.maxAttempts, batch],
    );

    for (const row of rows) {
      await this.send(
        { partyId: row.party_id, event: row.event, payload: row.payload },
        { channel: row.channel, severity: row.severity } as TemplateRow,
        { id: row.id, subject: row.subject, body: row.body },
      );
    }
    if (rows.length > 0) this.logger.warn(`pending sweep re-sent ${rows.length} stranded deliveries`);
    return rows.length;
  }

  /**
   * Steps 2 and 3 for a row this caller holds the lease on. Sends what the
   * row recorded rather than a fresh render: a reclaimed row is the record of
   * what the customer was told, and the template may have changed since.
   */
  private async send(req: NotifyRequest, template: TemplateRow, claimed: Claimed): Promise<boolean> {
    try {
      const count = await this.dispatch(req, template, claimed.subject, claimed.body);
      await this.markSent(claimed.id, count);
      // null is a push handed to the cross-replica fan-out: it went out,
      // even though the socket count is not knowable from this replica.
      return count === null || count > 0;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.markFailed(claimed.id, reason);
      this.logger.warn(`${template.channel} delivery of ${req.event} to ${req.partyId || 'all'} failed: ${reason}`);
      return false;
    }
  }

  private async dispatch(
    req: NotifyRequest,
    template: TemplateRow,
    subject: string,
    body: string,
  ): Promise<number | null> {
    switch (template.channel) {
      case 'IN_APP': {
        const message = {
          event: req.event,
          subject,
          body,
          severity: template.severity,
          payload: req.payload,
        };
        // An empty partyId is an operator broadcast — a reconciliation break
        // goes to everyone watching, not to a customer. LiveFanout decides
        // whether that reaches every replica's sockets or only this one's.
        return this.live.push(req.partyId, 'notification', message);
      }

      case 'EMAIL':
        return this.email.send({
          to: String(req.payload.email ?? '') || `${req.partyId}@damp.local`,
          subject,
          body,
        });

      default:
        return 0;
    }
  }

  private async templatesFor(event: string): Promise<TemplateRow[]> {
    const { rows } = await this.db.query<TemplateRow>(
      `SELECT * FROM templates WHERE event = $1 AND active AND channel <> 'WEBHOOK' ORDER BY channel`,
      [event],
    );
    return rows;
  }

  /**
   * Absence of a preference row means enabled.
   *
   * A customer who has never opened their settings should still be told their
   * money arrived, so only an explicit `enabled = false` suppresses anything.
   * Defaulting the other way would mean a silent platform for everyone who
   * hasn't configured it.
   */
  private async isEnabled(partyId: string, event: string, channel: string): Promise<boolean> {
    if (!partyId) return true;
    const { rows } = await this.db.query<{ enabled: boolean }>(
      'SELECT enabled FROM preferences WHERE party_id = $1 AND event = $2 AND channel = $3',
      [partyId, event, channel],
    );
    return rows[0]?.enabled ?? true;
  }

  /**
   * Writes the delivery row — or, for a replay, decides whether this caller
   * now owns sending it.
   *
   * Returns the row to send, or null when there is nothing to do: the key is
   * already SENT, FAILED or SUPPRESSED, or PENDING under somebody's live
   * lease. A PENDING row whose lease has lapsed is reclaimed by this same
   * statement, which is how a replay of a crashed delivery re-sends it rather
   * than skipping it as a duplicate. Only a PENDING write reclaims; a
   * SUPPRESSED one behaves exactly as it always did.
   */
  private async record(
    req: NotifyRequest,
    template: TemplateRow,
    status: string,
    failureReason: string,
    _count: number,
    subject = '',
    body = '',
  ): Promise<Claimed | null> {
    // The dedupe key is per (producer key, channel): the same event legitimately
    // produces an in-app message and an email, and they must not collide with
    // each other while still colliding with their own replay.
    const dedupeKey = req.dedupeKey ? `${req.dedupeKey}:${template.channel}` : null;

    const { rows } = await this.db.query<Claimed>(
      `INSERT INTO deliveries (id, party_id, event, channel, subject, body, severity, payload, status, failure_reason,
                               dedupe_key, claimed_at, attempts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now(), 1)
       ON CONFLICT (dedupe_key) DO UPDATE
          SET claimed_at = now(), attempts = deliveries.attempts + 1
        WHERE EXCLUDED.status = 'PENDING'
          AND deliveries.status = 'PENDING'
          AND deliveries.claimed_at < now() - make_interval(secs => $12)
          AND deliveries.attempts < $13
       RETURNING id, subject, body`,
      [
        `dlv_${randomUUID()}`,
        req.partyId,
        req.event,
        template.channel,
        subject,
        body,
        template.severity,
        JSON.stringify(req.payload),
        status,
        failureReason,
        dedupeKey,
        this.staleSeconds,
        this.maxAttempts,
      ],
    );
    return rows[0] ?? null;
  }

  private async markSent(id: string, count: number | null): Promise<void> {
    // A count of zero is still SENT, not FAILED: "delivered to no open
    // sockets" means the customer was offline, and the stored row is exactly
    // how they find it when they come back. A null count (recipients: null in
    // the payload) means the push was fanned out over NATS, where each
    // replica delivers to its own sockets and nobody counts the total.
    await this.db.query(
      `UPDATE deliveries SET status = 'SENT', sent_at = now(),
              payload = payload || jsonb_build_object('recipients', $2::int)
        WHERE id = $1`,
      [id, count],
    );
  }

  private async markFailed(id: string, reason: string): Promise<void> {
    await this.db.query(`UPDATE deliveries SET status = 'FAILED', failure_reason = $2 WHERE id = $1`, [
      id,
      reason.slice(0, 2000),
    ]);
  }
}
