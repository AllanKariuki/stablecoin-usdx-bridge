import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { payloadDigest } from './digest';
import { ApprovalRequest, RequestsService } from './requests.service';

/**
 * Maker-checker's HTTP surface.
 *
 * Two audiences: services proposing actions (`POST /approval-requests`), and
 * humans deciding on them. Both go through the gateway, so the roles this
 * service checks against a policy are the ones auth-proxy resolved.
 */
@Controller()
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get('approval-policies')
  async policies() {
    return { policies: await this.requests.policies() };
  }

  @Get('approval-requests')
  async list(@Query('subjectType') subjectType?: string, @Query('subjectId') subjectId?: string) {
    const requests =
      subjectType && subjectId
        ? await this.requests.forSubject(subjectType, subjectId)
        : await this.requests.pending();
    return { requests: requests.map(render) };
  }

  @Get('approval-requests/:id')
  async get(@Param('id') id: string) {
    const request = await this.requests.find(id);
    return request ? render(request) : { error: 'not found' };
  }

  @Post('approval-requests')
  async propose(
    @CurrentUser() userId: string,
    @Body()
    body: {
      action: string;
      subjectType: string;
      subjectId: string;
      payload: unknown;
      summary?: Record<string, unknown>;
      reason?: string;
      callbackUrl?: string;
      roles?: string[];
    },
  ) {
    const request = await this.requests.propose({
      action: body.action,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      payload: body.payload,
      summary: body.summary,
      requestedBy: userId,
      requestedByRoles: body.roles ?? [],
      reason: body.reason,
      callbackUrl: body.callbackUrl,
    });
    return render(request);
  }

  @Post('approval-requests/:id/approve')
  @HttpCode(200)
  async approve(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: { comment?: string; roles?: string[] },
  ) {
    const request = await this.requests.decide({
      requestId: id,
      decision: 'APPROVE',
      decidedBy: userId,
      decidedByRoles: body?.roles ?? [],
      comment: body?.comment,
    });
    return render(request);
  }

  @Post('approval-requests/:id/reject')
  @HttpCode(200)
  async reject(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: { comment?: string; roles?: string[] },
  ) {
    const request = await this.requests.decide({
      requestId: id,
      decision: 'REJECT',
      decidedBy: userId,
      decidedByRoles: body?.roles ?? [],
      comment: body?.comment,
    });
    return render(request);
  }

  @Post('approval-requests/:id/cancel')
  @HttpCode(200)
  async cancel(@CurrentUser() userId: string, @Param('id') id: string) {
    return render(await this.requests.cancel(id, userId));
  }

  /**
   * Computes a digest without proposing anything.
   *
   * It exists so a calling service can assert, in its own tests, that its
   * encoding of a payload matches this one — the two sides agreeing is the
   * whole basis of the scheme, and discovering they disagree in production
   * means every approval starts failing verification at once.
   */
  @Post('approval-requests/digest')
  @HttpCode(200)
  digest(@Body() body: { payload: unknown }) {
    return { digest: payloadDigest(body?.payload) };
  }
}

function render(request: ApprovalRequest) {
  return {
    id: request.id,
    action: request.action,
    subjectType: request.subjectType,
    subjectId: request.subjectId,
    // Returned so the caller can re-verify it against its own object. It is
    // not a secret: it authorizes nothing on its own, it only proves that
    // what was approved is what is about to happen.
    payloadDigest: request.payloadDigest,
    summary: request.summary,
    requestedBy: request.requestedBy,
    reason: request.reason,
    status: request.status,
    approvals: request.approvals.map((a) => ({
      decision: a.decision,
      decidedBy: a.decidedBy,
      comment: a.comment,
      at: a.createdAt.toISOString(),
    })),
    expiresAt: request.expiresAt.toISOString(),
    decidedAt: request.decidedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
  };
}
