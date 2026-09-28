import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express-serve-static-core';
import { UpstreamProxy } from './upstream.proxy';

/**
 * Everything services/payments owns, reached through the one origin the
 * browser knows.
 *
 * Route *shapes* are listed explicitly rather than mounted as a single
 * wildcard, so that the set of paths the BFF exposes is readable here and
 * matches — one for one — the rules in services/auth-proxy's route table. A
 * blanket `@All('*')` would let a new upstream endpoint become publicly
 * reachable the moment it was written, before anybody had decided which
 * permission guards it.
 */
@Controller()
export class PaymentsProxyController {
  private readonly baseUrl: string;

  constructor(
    private readonly proxy: UpstreamProxy,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('PAYMENTS_URL', { infer: true }) ?? '';
  }

  @All(['banks', 'banks/*path'])
  banks(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }

  @All(['payment-intents', 'payment-intents/*path'])
  intents(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }

  @All(['invoices', 'invoices/*path'])
  invoices(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }
}
