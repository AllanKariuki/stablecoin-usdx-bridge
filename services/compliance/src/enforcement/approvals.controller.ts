import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { EnforcementService } from './enforcement.service';

/** services/workflow's callback. Safe to be unauthenticated: see the digest. */
@Controller('internal/approvals')
export class ApprovalsController {
  private readonly logger = new Logger(ApprovalsController.name);

  constructor(private readonly enforcement: EnforcementService) {}

  @Post('callback')
  @HttpCode(200)
  async callback(@Body() body: { subjectType: string; subjectId: string; payloadDigest: string; status: string }) {
    if (body?.subjectType !== 'ENFORCEMENT_ACTION') return { applied: false, reason: 'not an enforcement action' };

    const result = await this.enforcement.onApprovalDecision({
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
