import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express-serve-static-core';
import { UpstreamProxy } from './upstream.proxy';

/**
 * services/pricing — pair policy and indicative rates — for the Ops
 * Console's treasury workspace.
 *
 * pricing serves /pairs and /rates at its own origin; the gateway exposes
 * them under a /pricing prefix so the two read-only pair/rate surfaces sit
 * beside rms's /exposure and /treasury without colliding with any other
 * service's /pairs or /rates. The prefix is stripped here before the
 * forward, exactly like the /api prefix UpstreamProxy strips.
 *
 * Like the rms proxy, every route is spelled out rather than wildcarded, so
 * a new pricing endpoint is not publicly reachable until a permission rule
 * for it exists in services/auth-proxy's table.
 */
@Controller()
export class PricingProxyController {
  private readonly baseUrl: string;

  constructor(
    private readonly proxy: UpstreamProxy,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('PRICING_URL', { infer: true }) ?? '';
  }

  @All(['pricing/pairs', 'pricing/pairs/:base/:quote', 'pricing/rates'])
  pricing(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res, req.originalUrl.replace(/^\/api/, '').replace(/^\/pricing/, ''));
  }

  /**
   * The customer-facing rates surface (slice 4b), separate from the ops
   * console's /pricing/* paths: the portal reads GET /rates and
   * GET /rates/history at bff's root, and they forward to the same pricing
   * origin the ops paths do (svc-bff holds pricing.read). They are listed
   * explicitly like every other proxy route, so the set stays one-for-one
   * with services/auth-proxy's table.
   */
  @All(['rates', 'rates/history'])
  rates(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }
}
