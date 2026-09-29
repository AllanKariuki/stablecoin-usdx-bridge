import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { CasesService } from './cases.service';

/**
 * services/workflow's callback.
 *
 * Unauthenticated and cluster-internal, and safe to be so *because of the
 * digest*: everything in this body is re-verified against the case as it
 * stands, and a decision that does not match is refused and logged. The
 * worst an attacker who can reach this endpoint can do is cause a log line.
 */
@Controller('internal/approvals')
export class ApprovalsController {
  private readonly logger = new Logger(ApprovalsController.name);

  constructor(private readonly cases: CasesService) {}

  @Post('callback')
  @HttpCode(200)
  async callback(
    @Body() body: { subjectType: string; subjectId: string; payloadDigest: string; status: string },
  ) {
    if (body?.subjectType !== 'KYC_CASE') return { applied: false, reason: 'not a KYC case' };

    const result = await this.cases.onApprovalDecision({
      subjectId: body.subjectId,
      payloadDigest: body.payloadDigest,
      status: body.status,
    });

    // Always 200, even when the decision was refused. workflow retries a
    // non-2xx until its budget is spent, and a digest mismatch will never
    // stop being a mismatch — retrying it forever just buries the log line
    // that matters.
    if (!result.applied) {
      this.logger.warn(`approval for ${body.subjectId} was not applied: ${result.reason}`);
    }
    return result;
  }
}
