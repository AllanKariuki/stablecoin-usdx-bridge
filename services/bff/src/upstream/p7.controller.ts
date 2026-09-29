import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express-serve-static-core';
import { UpstreamProxy } from './upstream.proxy';

@Controller()
export class ReportingProxyController {
  private readonly baseUrl: string;

  constructor(
    private readonly proxy: UpstreamProxy,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('REPORTING_URL', { infer: true }) ?? '';
  }

  @All(['reports', 'reports/*path'])
  reports(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }
}

/**
 * The audit trail's read surface.
 *
 * `/internal/events` — where services record — is deliberately absent. It is
 * cluster-internal, and a wildcard here would have exposed the one endpoint
 * that *writes* the audit log through a gateway, which is the sort of thing
 * that should require somebody to type it out on purpose.
 */
@Controller()
export class AuditTrailProxyController {
  private readonly baseUrl: string;

  constructor(
    private readonly proxy: UpstreamProxy,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('AUDIT_TRAIL_URL', { infer: true }) ?? '';
  }

  @All(['audit', 'audit/*path'])
  audit(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }
}
