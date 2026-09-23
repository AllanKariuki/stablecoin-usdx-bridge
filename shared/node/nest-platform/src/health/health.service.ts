import { HttpException, Inject, Injectable } from '@nestjs/common';
import {
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorFunction,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { PLATFORM_VERSION_INFO, VersionInfo } from '../constants';
import { Checker } from './health.types';

export interface CheckResult {
  ok: boolean;
  error?: string;
}

export interface ReadinessResult {
  ready: boolean;
  checks: Record<string, CheckResult>;
}

/**
 * PlatformHealthService owns the liveness/readiness state shared between the
 * HTTP routes and the graceful-shutdown sequence — the direct counterpart of
 * shared/go/platform/health.go's Health struct. `SetReady(false)` (called by
 * the shutdown sequence) flips the flag the *next* /readyz poll reports,
 * before the process actually stops accepting connections, giving a load
 * balancer time to stop routing here.
 *
 * Built on @nestjs/terminus's HealthCheckService/HealthIndicatorService to
 * actually run the registered checks (so a check that throws, times out, or
 * rejects is handled the well-tested way terminus already does), but the
 * controller layer builds its own {status, checks} response body directly
 * rather than letting Terminus's own ServiceUnavailableException flow
 * through Nest's global exception filter — matching shared/go/platform/health.go,
 * where /healthz, /readyz and /version each write their own bespoke JSON
 * body directly and never go through the generic {error, code, request_id}
 * envelope, which is reserved for actual business/handler errors.
 */
@Injectable()
export class PlatformHealthService {
  private ready = true;
  private readonly checks = new Map<string, Checker>();

  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(PLATFORM_VERSION_INFO) public readonly versionInfo: VersionInfo,
  ) {}

  /**
   * AddCheck registers a named dependency check, evaluated on every /readyz
   * call. Liveness never runs these — a slow dependency should make this
   * instance stop receiving traffic, not make an orchestrator think the
   * process itself is dead and restart it.
   */
  addCheck(name: string, fn: Checker): void {
    this.checks.set(name, fn);
  }

  /**
   * SetReady flips the flag /readyz reports. Used by the shutdown sequence;
   * exported so a service can also flip it false for a self-inflicted
   * maintenance-mode drain if it ever needs one.
   */
  setReady(ready: boolean): void {
    this.ready = ready;
  }

  isManuallyReady(): boolean {
    return this.ready;
  }

  private indicatorFunctions(): HealthIndicatorFunction[] {
    return Array.from(this.checks.entries()).map(([name, fn]) => async () => {
      const session = this.healthIndicatorService.check(name);
      try {
        await fn();
        return session.up();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return session.down(message);
      }
    });
  }

  /** Runs every registered check plus the manual ready flag, Go-shaped. */
  async checkReadiness(): Promise<ReadinessResult> {
    let checksHealthy = true;
    let result: HealthCheckResult;

    try {
      result = await this.healthCheckService.check(this.indicatorFunctions());
    } catch (err) {
      checksHealthy = false;
      if (err instanceof HttpException) {
        result = err.getResponse() as HealthCheckResult;
      } else {
        throw err;
      }
    }

    const checks: Record<string, CheckResult> = {};
    for (const [name, detail] of Object.entries(result.details ?? {})) {
      const d = detail as { status?: string; message?: string };
      checks[name] = d.status === 'up' ? { ok: true } : { ok: false, error: d.message ?? 'check failed' };
    }

    return { ready: checksHealthy && this.ready, checks };
  }
}
