import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { RequireServiceRole } from '@damp/nest-platform';
import { QuotesService } from './quotes.service';

/**
 * POST /quotes — the one way a rate enters the platform. Callers hold
 * pricing.quote (svc-bff and svc-payments); the quote they get back is
 * pinned to their party and their amount, live for the pair's TTL, and
 * consumed by exactly one conversion or FX payment.
 */
@Controller('quotes')
export class QuotesController {
  constructor(private readonly service: QuotesService) {}

  @Post()
  @RequireServiceRole('pricing.quote')
  create(@Body() body: { from?: unknown; to?: unknown; amount?: unknown; party_id?: unknown }) {
    if (typeof body.from !== 'string' || typeof body.to !== 'string' || typeof body.amount !== 'string') {
      throw new BadRequestException('body needs string fields: from, to, amount');
    }
    if (typeof body.party_id !== 'string' || body.party_id.trim() === '') {
      throw new BadRequestException('body needs party_id: quotes are pinned to one party');
    }
    return this.service.create({ from: body.from, to: body.to, amount: body.amount, partyId: body.party_id });
  }
}
