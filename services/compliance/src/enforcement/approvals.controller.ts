import { Body, Controller, Headers, HttpCode, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SIGNATURE_HEADER, verifyCallback } from './callback-signature';
import { EnforcementService } from './enforcement.service';

/** services/workflow's callback. Signed with WORKFLOW_CALLBACK_SECRET; see kyc's twin. */
@Controller('internal/approvals')
export class ApprovalsController {
  private readonly logger = new Logger(ApprovalsController.name);

  constructor(
    private readonly enforcement: EnforcementService,
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
    if (body.subjectType !== 'ENFORCEMENT_ACTION') return { applied: false, reason: 'not an enforcement action' };

    const result = await this.enforcement.onApprovalDecision({
      requestId: body.requestId,
      subjectId: body.subjectId,
      payloadDigest: body.payloadDigest,
      status: body.status,
    });
    if (!result.applied) {
      this.logger.warn(`approval for ${body.subjectId} was not applied: ${result.reason}`);
    }
    return result;
  }
}
