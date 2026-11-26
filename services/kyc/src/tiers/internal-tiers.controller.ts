import { Controller, Get, Param } from '@nestjs/common';
import { RequireServiceRole } from '@damp/nest-platform';
import { CasesService } from '../cases/cases.service';
import { TiersRepository } from './tiers.repository';

/**
 * The H5 money-path gate's endpoint.
 *
 * services/payments and services/bff call this before every money movement
 * (KycGate in @damp/nest-platform). It is deliberately a *service* route,
 * not the customer-facing GET /kyc/parties/:partyId/tier: the gate needs a
 * tier for any party id a caller names, while the user-facing route answers
 * only about the signed-in party. @RequireServiceRole('kyc.tier-read') means
 * svc-bff's user-proxy role does not reach it — only the two callers granted
 * kyc.tier-read explicitly.
 *
 * A party with no record is TIER_0 (rank 0) — the tiers repository's own
 * default, which is what makes "an unknown party can move no money" true by
 * construction. The full ordered tier list is returned so callers resolve
 * the rank of the minimum tier they demand from this response rather than
 * hardcoding ranks.
 */
@Controller('internal')
export class InternalTiersController {
  constructor(
    private readonly tiers: TiersRepository,
    private readonly cases: CasesService,
  ) {}

  @Get('parties/:partyId/tier')
  @RequireServiceRole('kyc.tier-read')
  async tierOf(@Param('partyId') partyId: string) {
    const tier = await this.tiers.tierFor(partyId);
    const all = await this.tiers.all();
    const open = await this.cases.openCaseFor(partyId);
    return {
      partyId,
      tier: { name: tier.name, rank: tier.rank },
      status: open ? open.status : null,
      tiers: all.map((t) => ({ name: t.name, rank: t.rank })),
    };
  }
}
