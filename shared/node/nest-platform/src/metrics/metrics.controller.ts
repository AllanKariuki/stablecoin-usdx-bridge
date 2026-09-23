import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express-serve-static-core';
import { PlatformMetricsService } from './metrics.service';

/** Exposes /metrics in the Prometheus text exposition format. */
@Controller()
export class PlatformMetricsController {
  constructor(private readonly metricsService: PlatformMetricsService) {}

  @Get('metrics')
  async metrics(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader('Content-Type', this.metricsService.contentType);
    res.setHeader('Cache-Control', 'no-store');
    return this.metricsService.metricsText();
  }
}
