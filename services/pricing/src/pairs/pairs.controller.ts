import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch } from '@nestjs/common';
import { AuditContext, AuditRequest, enqueueAuditEvent } from '@damp/nest-platform';
import { RequireServiceRole } from '@damp/nest-platform';
import { AUDIT, SERVICE } from '../audit/audit-actions';
import { Actor } from '../auth/actor.decorator';
import { DbService } from '../db/db.service';
import { isQuotable, toScaled } from '../money/rate';
import { PairPatch, PairsRepository } from './pairs.repository';

/**
 * The pair policy surface. Every ordered pair among the quotable currencies
 * is seeded by the migration, so this is tuning, not creation: how wide the
 * spread, how long a quote lives, whether the pair quotes at all. Changes
 * are audited with the row they replaced — a spread change is exactly the
 * kind of decision an auditor needs the "before" of.
 */
@Controller('pairs')
export class PairsController {
  constructor(
    private readonly pairs: PairsRepository,
    private readonly db: DbService,
  ) {}

  @Get()
  @RequireServiceRole('pricing.read')
  async list() {
    return { pairs: await this.pairs.list() };
  }

  @Patch(':base/:quote')
  @RequireServiceRole('pricing.admin')
  async update(
    @Actor() actor: string,
    @AuditContext() audit: AuditRequest,
    @Param('base') base: string,
    @Param('quote') quote: string,
    @Body() body: { spread_bps?: number; ttl_seconds?: number; enabled?: boolean; max_notional_usd?: string },
  ) {
    const baseCcy = base.toUpperCase();
    const quoteCcy = quote.toUpperCase();
    if (!isQuotable(baseCcy) || !isQuotable(quoteCcy)) {
      throw new BadRequestException(`${baseCcy}/${quoteCcy} is not a quotable pair`);
    }

    const patch = parsePatch(body);

    // Refuse a pair that was never seeded before opening a transaction; the
    // repository's own not-found throw stays as the defensive double-check.
    if (!(await this.pairs.find(baseCcy, quoteCcy))) {
      throw new NotFoundException(`pricing pair ${baseCcy}/${quoteCcy} does not exist`);
    }

    return this.db.transaction(async (q) => {
      const { pair, previous } = await this.pairs.update(baseCcy, quoteCcy, patch, actor, q);
      await enqueueAuditEvent(
        q,
        {
          actor,
          action: AUDIT.pairUpdated,
          subjectType: 'PRICING_PAIR',
          subjectId: `${baseCcy}/${quoteCcy}`,
          service: SERVICE,
          beforeState: previous ? { ...previous } : undefined,
          afterState: { ...pair },
        },
        audit,
      );
      return pair;
    });
  }
}

/** Validates a PATCH body into exactly the supported fields — a typo'd key
 * is refused rather than silently ignored. */
function parsePatch(body: {
  spread_bps?: number;
  ttl_seconds?: number;
  enabled?: boolean;
  max_notional_usd?: string;
}): PairPatch {
  const patch: PairPatch = {};

  if (body.spread_bps !== undefined) {
    if (!Number.isInteger(body.spread_bps) || body.spread_bps < 0 || body.spread_bps > 10000) {
      throw new BadRequestException('spread_bps must be an integer between 0 and 10000');
    }
    patch.spreadBps = body.spread_bps;
  }
  if (body.ttl_seconds !== undefined) {
    if (!Number.isInteger(body.ttl_seconds) || body.ttl_seconds < 1) {
      throw new BadRequestException('ttl_seconds must be a positive integer');
    }
    patch.ttlSeconds = body.ttl_seconds;
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') {
      throw new BadRequestException('enabled must be a boolean');
    }
    patch.enabled = body.enabled;
  }
  if (body.max_notional_usd !== undefined) {
    if (typeof body.max_notional_usd !== 'string') {
      throw new BadRequestException('max_notional_usd must be a decimal string');
    }
    let scaled;
    try {
      scaled = toScaled(body.max_notional_usd, 18);
    } catch (err) {
      throw new BadRequestException(`max_notional_usd: ${err instanceof Error ? err.message : 'invalid'}`);
    }
    if (scaled <= 0n) {
      throw new BadRequestException('max_notional_usd must be greater than zero');
    }
    patch.maxNotionalUsd = body.max_notional_usd;
  }
  if (Object.keys(patch).length === 0) {
    throw new BadRequestException('nothing to change: send spread_bps, ttl_seconds, enabled or max_notional_usd');
  }
  return patch;
}
