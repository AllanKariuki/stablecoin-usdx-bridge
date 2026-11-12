import { Injectable } from '@nestjs/common';
import { DeliveryService } from '../delivery/delivery.service';

/**
 * One core-ledger outbox event, however it arrived.
 *
 * core-ledger's relay drains to exactly one destination (outbox.Choose):
 * JetStream when its NATS_URL is set, otherwise an HTTP POST to
 * /internal/outbox. Both doors end here, so an event is handled — and
 * deduped — identically whichever transport carried it.
 *
 * The dedupe key is `outbox:<row id>` on both paths. That is what makes
 * switching a deployment from HTTP to NATS (or back) safe: an event the old
 * path already delivered collides with its own replay on the new one.
 */
@Injectable()
export class OutboxHandler {
  constructor(private readonly delivery: DeliveryService) {}

  /**
   * Throws only when the event could not be durably recorded (the database is
   * unreachable). A send that fails is recorded as FAILED and is not an error
   * here — the event was handled; the channel let it down.
   */
  handle(
    eventType: string,
    eventId: string,
    payload: Record<string, unknown>,
  ): Promise<{ delivered: number; suppressed: number }> {
    // Who this is about. Ledger events carry initiated_by; reserve events are
    // platform-wide and go to every connected operator, which is what an
    // empty party id means downstream.
    const partyId =
      typeof payload.initiated_by === 'string' && payload.initiated_by !== 'api' ? payload.initiated_by : '';

    return this.delivery.notify({
      event: eventType,
      partyId,
      payload: flatten(payload),
      dedupeKey: eventId ? `outbox:${eventId}` : undefined,
    });
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
export function flatten(payload: Record<string, unknown>): Record<string, unknown> {
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
