import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express-serve-static-core';
import { PlatformHealthService } from './health.service';

/**
 * Mounts /healthz, /readyz and /version — the direct counterpart of
 * shared/go/platform/health.go's Health.Register. Not /metrics — that
 * belongs to PlatformMetricsModule, registered separately so a service that
 * opts out of the metrics module doesn't get a dangling endpoint.
 */
@Controller()
export class PlatformHealthController {
  constructor(private readonly health: PlatformHealthService) {}

  /** Liveness: always 200, never touches a dependency. */
  @Get('healthz')
  healthz(): { status: string } {
    return { status: 'ok' };
  }

  /** Readiness: 503 if any registered check fails, or SetReady(false) was called. */
  @Get('readyz')
  async readyz(@Res({ passthrough: true }) res: Response): Promise<Record<string, unknown>> {
    const { ready, checks } = await this.health.checkReadiness();
    res.status(ready ? 200 : 503);
    return { status: ready ? 'ok' : 'degraded', checks };
  }

  @Get('version')
  version(): { service: string; version: string; commit: string } {
    return this.health.versionInfo;
  }
}
