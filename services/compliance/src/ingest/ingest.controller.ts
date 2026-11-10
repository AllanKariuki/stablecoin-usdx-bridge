import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { IngestService } from './ingest.service';

/**
 * Where core-ledger's outbox delivers.
 *
 * Cluster-internal and unauthenticated, like every `/internal/*` route on
 * this platform, and absent from the gateway's route table — whose default is
 * deny.
 *
 * Always 2xx once handled, including for event types this service does not
 * care about. The relay treats a non-2xx as "not delivered" and retries until
 * its budget is spent, so returning an error for an event compliance has no
 * rule for would dead-letter a perfectly healthy ledger event.
 */
@Controller('internal')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post('outbox')
  @HttpCode(200)
  async outbox(@Headers('x-event-type') eventType: string, @Body() payload: Record<string, unknown>) {
    if (eventType !== 'damp.ledger.transaction_posted.v1') {
      return { accepted: true, evaluated: false, reason: `compliance does not consume ${eventType}` };
    }
    const result = await this.ingest.onTransactionPosted(payload);
    return { accepted: true, evaluated: true, ...result };
  }
}
