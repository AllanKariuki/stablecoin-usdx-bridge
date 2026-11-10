import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';
import { render } from '../templates/render';
import { WsGateway } from '../ws/ws.gateway';
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
 * Nothing here throws at its caller. Every producer in this platform calls
 * notifications best-effort, because a notification that fails to send must
 * never fail a settlement that already happened.
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly db: DbService,
    private readonly ws: WsGateway,
    private readonly email: EmailTransport,
    private readonly webhooks: WebhooksService,
  ) {}

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

      const id = await this.record(req, template, 'PENDING', '', 0, subject, body);
      if (!id) {
        // The dedupe key collided: this exact notification has already been
        // produced. Silently correct — it is what at-least-once delivery
        // looks like from the receiving end.
        continue;
      }

      try {
        const count = await this.dispatch(req, template, subject, body);
        await this.markSent(id, count);
        delivered += count > 0 ? 1 : 0;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await this.markFailed(id, reason);
        this.logger.warn(`${template.channel} delivery of ${req.event} to ${req.partyId || 'all'} failed: ${reason}`);
      }
    }

    // Webhooks are queued rather than sent inline: a subscriber's slow
    // endpoint must not hold up an in-app toast, and the retry schedule needs
    // to outlive this request anyway.
    if (req.partyId) {
      await this.webhooks.enqueue(req.partyId, req.event, req.payload);
    }

    return { delivered, suppressed };
  }

  private async dispatch(
    req: NotifyRequest,
    template: TemplateRow,
    subject: string,
    body: string,
  ): Promise<number> {
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
        // goes to everyone watching, not to a customer.
        return req.partyId
          ? this.ws.broadcast(req.partyId, 'notification', message)
          : this.ws.broadcastAll('notification', message);
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

  private async record(
    req: NotifyRequest,
    template: TemplateRow,
    status: string,
    failureReason: string,
    _count: number,
    subject = '',
    body = '',
  ): Promise<string | null> {
    // The dedupe key is per (producer key, channel): the same event legitimately
    // produces an in-app message and an email, and they must not collide with
    // each other while still colliding with their own replay.
    const dedupeKey = req.dedupeKey ? `${req.dedupeKey}:${template.channel}` : null;

    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO deliveries (id, party_id, event, channel, subject, body, severity, payload, status, failure_reason, dedupe_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id`,
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
      ],
    );
    return rows[0]?.id ?? null;
  }

  private async markSent(id: string, count: number): Promise<void> {
    // A count of zero is still SENT, not FAILED: "delivered to no open
    // sockets" means the customer was offline, and the stored row is exactly
    // how they find it when they come back.
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
