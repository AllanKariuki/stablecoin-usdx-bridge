import { Body, Controller, Headers, HttpCode, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SIGNATURE_HEADER, verifyCallback } from '../workflow/callback-signature';
import { CasesService } from './cases.service';

/**
 * services/workflow's callback.
 *
 * Cluster-internal, but not trusted on the network: the body is signed with
 * WORKFLOW_CALLBACK_SECRET and an unsigned or mis-signed call is refused with
 * 401. Past that, the body is still re-verified against the case as it
 * stands — the request id must be the one this case recorded and the digest
 * must match its payload.
 */
@Controller('internal/approvals')
export class ApprovalsController {
  private readonly logger = new Logger(ApprovalsController.name);

  constructor(
    private readonly cases: CasesService,
    private readonly config: ConfigService,
  ) {}

  @Post('callback')
  @HttpCode(200)
  async callback(
    @Headers(SIGNATURE_HEADER) signature: string | undefined,
    @Body()
    body: { requestId: string; subjectType: string; subjectId: string; payloadDigest: string; status: string },
  ) {
    const secret = this.config.get<string>('WORKFLOW_CALLBACK_SECRET') ?? '';
    if (!body || !verifyCallback(secret, signature, body)) {
      throw new UnauthorizedException('approval callback not authenticated');
    }
    if (body.subjectType !== 'KYC_CASE') return { applied: false, reason: 'not a KYC case' };

    const result = await this.cases.onApprovalDecision({
      requestId: body.requestId,
      subjectId: body.subjectId,
      payloadDigest: body.payloadDigest,
      status: body.status,
    });

    // 200 even when the decision was refused on its merits: workflow retries
    // a non-2xx until its budget is spent, and a digest mismatch will never
    // stop being a mismatch. Authentication failure is different and is 401.
    if (!result.applied) {
      this.logger.warn(`approval for ${body.subjectId} was not applied: ${result.reason}`);
    }
    return result;
  }
}
