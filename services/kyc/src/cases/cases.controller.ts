import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TiersRepository } from '../tiers/tiers.repository';
import { StorageService } from '../storage/storage.service';
import { CasesService, KycCase } from './cases.service';

@Controller()
export class CasesController {
  constructor(
    private readonly cases: CasesService,
    private readonly tiers: TiersRepository,
    private readonly storage: StorageService,
  ) {}

  // --- The customer's own view --------------------------------------------

  /**
   * What this party can currently do.
   *
   * The single endpoint the frontend needs to decide whether to show a
   * deposit button. It answers with the tier and its limits rather than a
   * boolean, because "you can't deposit" and "you can't deposit *more than
   * this*" are different messages to a customer.
   */
  @Get('kyc/status')
  async status(@CurrentUser() partyId: string) {
    const tier = await this.tiers.tierFor(partyId);
    const open = await this.cases.openCaseFor(partyId);
    return {
      tier: tier.name,
      tierRank: tier.rank,
      description: tier.description,
      limits: {
        currency: tier.currency,
        daily: tier.dailyLimit,
        monthly: tier.monthlyLimit,
        singleTransaction: tier.singleTxLimit,
      },
      can: {
        deposit: tier.canDeposit,
        withdraw: tier.canWithdraw,
        issue: tier.canIssue,
        bridge: tier.canBridge,
      },
      openCase: open ? { id: open.id, status: open.status, requestedTier: open.requestedTier } : null,
      nextTierRequires: await this.nextTierRequirements(tier.rank),
    };
  }

  @Get('kyc/cases')
  async myCases(@CurrentUser() partyId: string) {
    return { cases: (await this.cases.casesFor(partyId)).map(render) };
  }

  @Post('kyc/cases')
  async open(@CurrentUser() partyId: string, @Body() body: { tier?: string }) {
    return render(await this.cases.open(partyId, body?.tier ?? 'TIER_1'));
  }

  /**
   * Requests an upload slot.
   *
   * The file goes straight from the browser to object storage on a presigned
   * URL; it never passes through this service. That keeps passport scans out
   * of this process's memory, its logs and its request traces — and out of
   * every intermediary that would otherwise see the body.
   */
  @Post('kyc/cases/:caseId/documents/upload-url')
  @HttpCode(200)
  async uploadUrl(
    @CurrentUser() partyId: string,
    @Param('caseId') caseId: string,
    @Body() body: { kind: string; contentType: string },
  ) {
    const kycCase = await this.cases.find(caseId);
    if (!kycCase || kycCase.partyId !== partyId) throw new NotFoundException('no such case');
    return this.storage.presignUpload({ caseId, partyId, kind: body.kind, contentType: body.contentType });
  }

  /** Confirms an upload landed, recording its hash and size. */
  @Post('kyc/cases/:caseId/documents')
  async addDocument(
    @CurrentUser() partyId: string,
    @Param('caseId') caseId: string,
    @Body() body: { kind: string; storageKey: string; contentType: string; sizeBytes: number; sha256: string },
  ) {
    await this.cases.addDocument({ caseId, partyId, ...body });
    return { documents: await this.cases.documentsFor(caseId) };
  }

  @Post('kyc/cases/:caseId/submit')
  @HttpCode(200)
  async submit(
    @CurrentUser() partyId: string,
    @Param('caseId') caseId: string,
    @Body() body: { email: string; fullName: string; country: string },
  ) {
    const updated = await this.cases.submit(caseId, partyId, {
      email: body?.email ?? '',
      fullName: body?.fullName ?? '',
      country: body?.country ?? '',
    });
    return render(updated!);
  }

  // --- The compliance officer's view --------------------------------------

  @Get('kyc/queue')
  async queue() {
    return { cases: (await this.cases.queue()).map(render) };
  }

  @Get('kyc/cases/:caseId')
  async get(@Param('caseId') caseId: string) {
    const kycCase = await this.cases.find(caseId);
    if (!kycCase) throw new NotFoundException('no such case');
    return {
      ...render(kycCase),
      // Shown to a reviewer, not to the customer: the reasons a provider
      // flagged somebody are exactly what must not be disclosed to them.
      providerResult: kycCase.providerResult,
      documents: await this.cases.documentsFor(caseId),
    };
  }

  /**
   * A reviewer's decision.
   *
   * It *proposes*; it does not grant. Approving opens a maker-checker request
   * and the case moves to PENDING_APPROVAL — the tier is granted only when
   * that request comes back approved and its payload digest still matches
   * the case.
   */
  @Post('kyc/cases/:caseId/review')
  @HttpCode(200)
  async review(
    @CurrentUser() reviewerId: string,
    @Param('caseId') caseId: string,
    @Body() body: { decision: 'APPROVE' | 'REJECT'; notes?: string },
  ) {
    const updated = await this.cases.review(caseId, reviewerId, body.decision, body?.notes ?? '');
    return render(updated!);
  }

  @Get('kyc/tiers')
  async listTiers() {
    return { tiers: await this.tiers.all() };
  }

  @Get('kyc/parties/:partyId/tier')
  async tierOf(@Param('partyId') partyId: string, @Query('history') history?: string) {
    const tier = await this.tiers.tierFor(partyId);
    return {
      tier: tier.name,
      limits: { daily: tier.dailyLimit, monthly: tier.monthlyLimit, singleTransaction: tier.singleTxLimit },
      history: history === 'true' ? await this.tiers.history(partyId) : undefined,
    };
  }

  private async nextTierRequirements(currentRank: number) {
    const tiers = await this.tiers.all();
    const next = tiers.find((t) => t.rank === currentRank + 1);
    return next ? { tier: next.name, documents: next.requiredDocuments } : null;
  }
}

function render(kycCase: KycCase) {
  return {
    id: kycCase.id,
    partyId: kycCase.partyId,
    requestedTier: kycCase.requestedTier,
    status: kycCase.status,
    riskScore: kycCase.riskScore,
    reviewedBy: kycCase.reviewedBy,
    reviewNotes: kycCase.reviewNotes,
    // A customer sees that they were rejected and the reason recorded for
    // them. They do not see the provider's raw response — see the reviewer
    // endpoint above.
    rejectionReason: kycCase.rejectionReason,
    approvalRequestId: kycCase.approvalRequestId || null,
    submittedAt: kycCase.submittedAt?.toISOString() ?? null,
    decidedAt: kycCase.decidedAt?.toISOString() ?? null,
    createdAt: kycCase.createdAt.toISOString(),
  };
}
