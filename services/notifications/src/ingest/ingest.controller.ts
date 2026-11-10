import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { DeliveryService } from '../delivery/delivery.service';

/**
 * Where events arrive.
 *
 * Two doors, on purpose:
 *
 *  - `/internal/events` is the direct, best-effort call other services make
 *    when they want the customer told *now* — payments calls it the moment a
 *    settlement lands, so the toast appears while the page is still open.
 *
 *  - `/internal/outbox` is the durable one. core-ledger's transactional
 *    outbox relay POSTs here (`OUTBOX_RELAY_URL`), which means the event was
 *    written inside the same SERIALIZABLE transaction that moved the money —
 *    so "the journal was posted" and "somebody was told" cannot diverge. This
 *    is also where reconciliation's break alerts arrive, which is the last
 *    link in making R7's "the one control catching an unbacked mint is
 *    decorative" untrue.
 *
 * Both are unauthenticated and both are cluster-internal only (see the
 * NetworkPolicy). Neither can be reached through the gateway: there is no
 * rule for `/internal/*` in auth-proxy's route table, and its default is
 * deny.
 */
@Controller('internal')
export class IngestController {
  private readonly logger = new Logger(IngestController.name);

  constructor(private readonly delivery: DeliveryService) {}

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

    // Who this is about. Ledger events carry initiated_by; reserve events are
    // platform-wide and go to every connected operator, which is what an
    // empty party id means downstream.
    const partyId =
      typeof payload.initiated_by === 'string' && payload.initiated_by !== 'api' ? payload.initiated_by : '';

    const result = await this.delivery.notify({
      event: eventType,
      partyId,
      payload: flatten(payload),
      dedupeKey: eventId ? `outbox:${eventId}` : undefined,
    });
    return { accepted: true, ...result };
  }
}

/**
 * Lifts a payload's top-level scalars alongside the nested original.
 *
 * Templates address values by name (`{{leg}}`, `{{amount}}`), and the two
 * event families this service consumes nest differently — the ledger's
 * transaction_posted has its interesting fields at the top level, the
 * reserve events have theirs one level in. Flattening one level means a
 * template author writes `{{leg}}` rather than having to know which producer
 * shaped it.
 */
function flatten(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  for (const value of Object.values(payload)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        // Never shadows a top-level key: the producer's own naming wins.
        if (!(k in out)) out[k] = v;
      }
    }
  }
  return out;
}
