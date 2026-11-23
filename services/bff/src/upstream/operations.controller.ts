import { Controller, Get, Post, Put, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenClient } from '@damp/nest-platform';
import type { Request, Response } from 'express-serve-static-core';
import { UpstreamProxy } from './upstream.proxy';

/**
 * services/rms — reserve status, targets, custodians and attestations — for
 * the Ops Console's treasury workspace.
 *
 * Every route is spelled out, matching services/auth-proxy's route table one
 * for one, for the same reason as the P4/P5/P7 proxies: a wildcard would make
 * a new rms endpoint public the moment it was written, before anybody had
 * decided which permission guards it. (rms's /reserves/status is served here;
 * the reconciliation runs and breaks under /reserves/ belong to core-ledger
 * and are forwarded by CoreLedgerOperationsProxyController below.)
 */
@Controller()
export class RmsProxyController {
  private readonly baseUrl: string;

  constructor(
    private readonly proxy: UpstreamProxy,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('RMS_URL', { infer: true }) ?? '';
  }

  @Get(['reserves/status', 'reserves/targets', 'custodians', 'custodians/:custodianId/statements', 'attestations', 'attestations/:attestationId'])
  read(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }

  @Put('reserves/targets/:currency')
  setTarget(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }

  @Post(['custodians/:custodianId/poll', 'custodians/:custodianId/drift', 'attestations', 'attestations/:attestationId/publish'])
  write(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }
}

/**
 * core-ledger's operator surface: ledger reads (accounts, trial balance,
 * integrity), reconciliation history, and the three operator writes
 * (reversal, period close, break-glass redemption confirm).
 *
 * Forwarded, not reshaped. Unlike the customer-facing wallet/transaction
 * routes, these are read by staff tooling only and carry core-ledger's own
 * snake_case shapes; giving them a translation layer would be a second
 * contract to keep in step with core-ledger for no customer benefit. The
 * permission check is auth-proxy's (ledger:read / ledger:admin /
 * transactions:reverse / reserves:read); X-User-Id is forwarded so
 * core-ledger stamps the operator as the actor.
 */
@Controller()
export class CoreLedgerOperationsProxyController {
  private readonly baseUrl: string;

  constructor(
    private readonly proxy: UpstreamProxy,
    private readonly serviceTokens: ServiceTokenClient,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('CORE_LEDGER_URL', { infer: true }) ?? '';
  }

  /** core-ledger authenticates every call (H2); the forwarded request
   * carries bff's own service-account token, never the user's. */
  private async forward(req: Request, res: Response) {
    return this.proxy.forward(this.baseUrl, req, res, undefined, {
      authorization: `Bearer ${await this.serviceTokens.accessToken()}`,
    });
  }

  @Get([
    'accounts',
    'accounts/:glCode/balance',
    'ledger/trial-balance',
    'ledger/integrity',
    'reserves/reconciliation-runs',
    'reserves/reconciliation-runs/:runId',
    'reserves/reconciliation-breaks',
  ])
  read(@Req() req: Request, @Res() res: Response) {
    return this.forward(req, res);
  }

  @Post(['transactions/:transactionId/reversal', 'ledger/closures', 'redemptions/:transactionId/confirm'])
  write(@Req() req: Request, @Res() res: Response) {
    return this.forward(req, res);
  }
}
