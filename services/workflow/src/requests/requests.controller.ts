import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { AuditContext, AuditRequest, PlatformException } from '@damp/nest-platform';
import { Actor, CurrentActor } from '../auth/current-user.decorator';
import { payloadDigest } from './digest';
import { ApprovalRequest, RequestsService } from './requests.service';

/**
 * Maker-checker's HTTP surface.
 *
 * Two audiences: services proposing actions (`POST /approval-requests`), and
 * humans deciding on them.
 *
 * Humans arrive through the gateway (Traefik → auth-proxy → bff), so their
 * X-User-Id and X-Roles are auth-proxy's, and the roles a policy is checked
 * against are those — never anything in the body. Services (kyc, compliance)
 * call `POST /approval-requests` directly on the internal network, forwarding
 * as X-User-Id the gateway identity of the officer whose action they are
 * proposing; they never decide, and the roles a proposer holds are recorded
 * but authorize nothing.
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
    @CurrentActor() actor: Actor,
    @AuditContext() audit: AuditRequest,
    @Body()
    body: {
      action: string;
      subjectType: string;
      subjectId: string;
      payload: unknown;
      summary?: Record<string, unknown>;
      reason?: string;
      callbackUrl?: string;
    },
  ) {
    refuseClaimedRoles(body);
    const request = await this.requests.propose({
      action: body.action,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      payload: body.payload,
      summary: body.summary,
      requestedBy: actor.userId,
      requestedByRoles: actor.roles,
      reason: body.reason,
      callbackUrl: body.callbackUrl,
      audit,
    });
    return render(request);
  }

  @Post('approval-requests/:id/approve')
  @HttpCode(200)
  async approve(
    @CurrentActor() actor: Actor,
    @AuditContext() audit: AuditRequest,
    @Param('id') id: string,
    @Body() body: { comment?: string },
  ) {
    refuseClaimedRoles(body);
    const request = await this.requests.decide({
      requestId: id,
      decision: 'APPROVE',
      decidedBy: actor.userId,
      decidedByRoles: actor.roles,
      comment: body?.comment,
      audit,
    });
    return render(request);
  }

  @Post('approval-requests/:id/reject')
  @HttpCode(200)
  async reject(
    @CurrentActor() actor: Actor,
    @AuditContext() audit: AuditRequest,
    @Param('id') id: string,
    @Body() body: { comment?: string },
  ) {
    refuseClaimedRoles(body);
    const request = await this.requests.decide({
      requestId: id,
      decision: 'REJECT',
      decidedBy: actor.userId,
      decidedByRoles: actor.roles,
      comment: body?.comment,
      audit,
    });
    return render(request);
  }

  @Post('approval-requests/:id/cancel')
  @HttpCode(200)
  async cancel(@CurrentActor() actor: Actor, @AuditContext() audit: AuditRequest, @Param('id') id: string) {
    return render(await this.requests.cancel(id, actor.userId, audit));
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

/**
 * Refuses a body that carries `roles`, rather than ignoring it.
 *
 * This endpoint used to authorize decisions against roles taken from the
 * body, so anyone the gateway let through could approve anything by claiming
 * `treasury`. Roles now come only from X-Roles. A body that still sends them
 * is either a client written against the old contract — which believes its
 * claim matters and should find out loudly — or somebody probing for the old
 * behaviour; silently dropping the field would hide both. Nothing on the
 * platform sends it today, so refusing costs nothing legitimate.
 */
function refuseClaimedRoles(body: unknown): void {
  if (body !== null && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'roles')) {
    throw new PlatformException(
      400,
      'ROLES_NOT_ACCEPTED',
      'roles are not accepted in the request body; they are taken from the identity the gateway resolved',
    );
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
