import { INestApplication, LoggerService } from '@nestjs/common';
import { DEFAULT_DRAIN_PERIOD_MS, DEFAULT_SHUTDOWN_TIMEOUT_MS } from '../constants';
import { PlatformHealthService } from '../health/health.service';

export interface ShutdownOptions {
  /** Defaults to 5000ms, matching shared/go/platform/shutdown.go's defaultDrainPeriod. */
  drainPeriodMs?: number;
  /** Defaults to 15000ms, matching shared/go/platform/shutdown.go's defaultShutdownTimeout. */
  shutdownTimeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * runShutdownSequence performs the exact drain/shutdown sequence shared/go/platform/shutdown.go's
 * Run runs on SIGTERM/SIGINT:
 *  1. flip readiness false (health.setReady(false)) — /readyz starts
 *     returning 503 so the load balancer stops sending new traffic here
 *  2. wait drainPeriodMs so requests already in flight through the LB land
 *     before...
 *  3. app.close(), bounded by shutdownTimeoutMs, to stop taking new
 *     connections and let in-process requests finish — INestApplication#close()
 *     already runs every provider's onModuleDestroy/beforeApplicationShutdown/
 *     onApplicationShutdown hook on its own, with no separate opt-in needed
 *  4. run cleanup (DB pool close, background job cancellation, etc.) in the
 *     order given
 *
 * Exported separately from installGracefulShutdown so it can be exercised
 * directly in a test without touching real OS signals or process.exit —
 * see test/shutdown.e2e-spec.ts for the real-signal, real-subprocess
 * version that mirrors how the Go side was actually verified live.
 */
export async function runShutdownSequence(
  app: INestApplication,
  health: PlatformHealthService,
  logger: LoggerService,
  options: ShutdownOptions = {},
  cleanup: Array<() => Promise<void>> = [],
): Promise<void> {
  const drainPeriodMs = options.drainPeriodMs && options.drainPeriodMs > 0 ? options.drainPeriodMs : DEFAULT_DRAIN_PERIOD_MS;
  const shutdownTimeoutMs =
    options.shutdownTimeoutMs && options.shutdownTimeoutMs > 0 ? options.shutdownTimeoutMs : DEFAULT_SHUTDOWN_TIMEOUT_MS;

  logger.log?.(`shutdown signal received, draining for ${drainPeriodMs}ms`);
  health.setReady(false);
  await sleep(drainPeriodMs);

  try {
    await withTimeout(app.close(), shutdownTimeoutMs, 'app.close timed out');
  } catch (err) {
    logger.error?.(`error shutting down http server: ${err instanceof Error ? err.message : String(err)}`);
  }

  for (const fn of cleanup) {
    try {
      await fn();
    } catch (err) {
      logger.error?.(`error during cleanup: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.log?.('shutdown complete');
}

/**
 * installGracefulShutdown is what a service's bootstrap (main.ts) actually
 * calls — the counterpart of shared/go/platform/shutdown.go's Run, minus
 * the `app.Listen` part (Nest's own `app.listen()` already returns control
 * to the caller, unlike fiber's blocking Listen, so there's no single
 * function that both serves and shuts down the way Go's Run does; this is
 * the deliberate, idiomatic split for Nest).
 *
 * Deliberately does *not* call `app.enableShutdownHooks()`: that method's
 * job is installing Nest's *own* SIGTERM/SIGINT listener, and — this is the
 * counter-intuitive part its own source makes clear — passing it an empty
 * signal list doesn't mean "listen to nothing", it means "the caller didn't
 * specify, so fall back to every default signal". Calling it here would
 * install a second listener racing this one, and Nest's own listener closes
 * the server immediately on the signal with no drain delay at all — which
 * defeats the entire point of this function (confirmed empirically: it
 * silently truncated the drain window to milliseconds in this package's own
 * shutdown.e2e-spec.ts before this comment was written). Nest's DI lifecycle
 * hooks don't need that opt-in anyway — `INestApplication#close()`, called
 * below by runShutdownSequence, already runs onModuleDestroy/
 * beforeApplicationShutdown/onApplicationShutdown on its own. This function
 * installs the *only* signal listener, so the drain period always completes
 * before anything closes the server.
 */
export function installGracefulShutdown(
  app: INestApplication,
  health: PlatformHealthService,
  logger: LoggerService,
  options: ShutdownOptions = {},
  cleanup: Array<() => Promise<void>> = [],
): void {
  let shuttingDown = false;
  const handle = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.log?.(`received ${signal}`);
    runShutdownSequence(app, health, logger, options, cleanup)
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error?.(`shutdown sequence failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      });
  };

  process.on('SIGTERM', handle);
  process.on('SIGINT', handle);
}
