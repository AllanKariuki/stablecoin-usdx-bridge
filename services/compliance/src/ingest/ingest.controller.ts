import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { RequireServiceRole } from '@damp/nest-platform';
import { IngestService } from './ingest.service';

/**
 * Where core-ledger's outbox delivers.
 *
 * Cluster-internal and absent from the gateway's route table — whose default
 * is deny. Since H3 it is also authenticated: the caller must carry a
 * service-account JWT with compliance.ingest (svc-core-ledger-worker), which
 * is what @RequireServiceRole declares below.
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
  @RequireServiceRole('compliance.ingest')
  @HttpCode(200)
  async outbox(@Headers('x-event-type') eventType: string, @Body() payload: Record<string, unknown>) {
    switch (eventType) {
      case 'damp.ledger.transaction_posted.v1': {
        const result = await this.ingest.onTransactionPosted(payload);
        return { accepted: true, evaluated: true, ...result };
      }
      case 'damp.ledger.chain_enforcement_finalized.v1': {
        const result = await this.ingest.onEnforcementFinalized(payload);
        return { accepted: true, ...result };
      }
      default:
        return { accepted: true, evaluated: false, reason: `compliance does not consume ${eventType}` };
    }
  }
}
