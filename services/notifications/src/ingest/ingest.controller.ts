import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { DeliveryService } from '../delivery/delivery.service';
import { OutboxHandler } from './outbox-handler';

/**
 * Where events arrive.
 *
 * Two doors, on purpose:
 *
 *  - `/internal/events` takes a named event for a party. payments' outbox
 *    relay posts here: the event was written in the same transaction as the
 *    settlement and is retried until accepted, with the outbox row id as
 *    `dedupeKey` so a replay tells nobody twice. Any non-2xx — including a
 *    database error surfacing as a 500 — makes the relay try again later.
 *
 *  - `/internal/outbox` is the durable one. core-ledger's transactional
 *    outbox relay POSTs here (`OUTBOX_RELAY_URL`), which means the event was
 *    written inside the same SERIALIZABLE transaction that moved the money —
 *    so "the journal was posted" and "somebody was told" cannot diverge. This
 *    is also where reconciliation's break alerts arrive, which is the last
 *    link in making R7's "the one control catching an unbacked mint is
 *    decorative" untrue.
 *
 *    When core-ledger's relay has NATS_URL set it publishes to JetStream
 *    instead, and OutboxConsumer picks the same events up from there. Both
 *    land in OutboxHandler with the same dedupe key.
 *
 * Both are unauthenticated and both are cluster-internal only (see the
 * NetworkPolicy). Neither can be reached through the gateway: there is no
 * rule for `/internal/*` in auth-proxy's route table, and its default is
 * deny.
 */
@Controller('internal')
export class IngestController {
  private readonly logger = new Logger(IngestController.name);

  constructor(
    private readonly delivery: DeliveryService,
    private readonly outboxHandler: OutboxHandler,
  ) {}

  @Post('events')
  @HttpCode(202)
  async event(@Body() body: { event: string; partyId?: string; payload?: Record<string, unknown>; dedupeKey?: string }) {
    if (!body?.event) return { accepted: false, reason: 'event is required' };

    const result = await this.delivery.notify({
      event: body.event,
      partyId: body.partyId ?? '',
      payload: body.payload ?? {},
      dedupeKey: body.dedupeKey,
    });
    return { accepted: true, ...result };
  }

  /**
   * The outbox relay's endpoint.
   *
   * Always 2xx once the event has been handled, including for events there is
   * no template for. The relay treats a non-2xx as "not delivered" and retries
   * with backoff until its budget is spent, so returning an error for an event
   * this service simply has no message for would dead-letter a perfectly
   * healthy ledger event.
   *
   * `X-Event-Id` is the relay's own row id and is used as the dedupe key: the
   * outbox is at-least-once by design — a relay that crashes between POSTing
   * and marking the row published re-delivers — so this is the routine case,
   * not the exception.
   */
  @Post('outbox')
  @HttpCode(200)
  async outbox(
    @Headers('x-event-type') eventType: string,
    @Headers('x-event-id') eventId: string,
    @Body() payload: Record<string, unknown>,
  ) {
    if (!eventType) {
      this.logger.warn('outbox POST with no X-Event-Type header; ignoring');
      return { accepted: false };
    }

    const result = await this.outboxHandler.handle(eventType, eventId ?? '', payload ?? {});
    return { accepted: true, ...result };
  }
}

