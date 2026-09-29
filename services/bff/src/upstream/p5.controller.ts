import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express-serve-static-core';
import { UpstreamProxy } from './upstream.proxy';

/**
 * P5's three services, forwarded.
 *
 * Route shapes are listed explicitly, as with P4's: the set of publicly
 * reachable paths stays readable in one place and matches auth-proxy's rules
 * one for one. A wildcard would quietly expose `/internal/approvals/callback`
 * — the endpoint services/workflow posts decisions to — through the gateway,
 * which is exactly the sort of thing that should require somebody to type it
 * out on purpose.
 */
@Controller()
export class WorkflowProxyController {
  private readonly baseUrl: string;

  constructor(
    private readonly proxy: UpstreamProxy,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('WORKFLOW_URL', { infer: true }) ?? '';
  }

  @All(['approval-requests', 'approval-requests/*path'])
  requests(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }

  @All(['approval-policies'])
  policies(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }
}

@Controller()
export class KycProxyController {
  private readonly baseUrl: string;

  constructor(
    private readonly proxy: UpstreamProxy,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('KYC_URL', { infer: true }) ?? '';
  }

  @All(['kyc', 'kyc/*path'])
  kyc(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }
}

@Controller()
export class ComplianceProxyController {
  private readonly baseUrl: string;

  constructor(
    private readonly proxy: UpstreamProxy,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('COMPLIANCE_URL', { infer: true }) ?? '';
  }

  @All(['compliance', 'compliance/*path'])
  compliance(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }
}
