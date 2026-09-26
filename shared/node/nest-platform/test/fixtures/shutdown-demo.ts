/**
 * A standalone service process (not run under Jest) that boots the demo app
 * the normal way a real service's main.ts would — NestFactory.create, not
 * @nestjs/testing — and installs the real graceful-shutdown handler,
 * listening for a genuine OS SIGTERM/SIGINT. test/shutdown.e2e-spec.ts spawns
 * this as a child process and sends it a real signal, timing the drain, the
 * same way the Go side was verified live ("timed a SIGTERM: exactly 5s drain
 * then clean exit") — this only runs in a throwaway subprocess specifically
 * so it's safe for installGracefulShutdown to call process.exit() at the end,
 * which would be unacceptable to do inside the Jest worker process itself.
 */
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { createDemoAppModule } from './demo-app.module';
import { PlatformHealthService } from '../../src/health/health.service';
import { installGracefulShutdown } from '../../src/shutdown/shutdown';

async function main(): Promise<void> {
  // Must happen before createDemoAppModule() is called — see that
  // function's doc comment: PlatformConfigModule.forRoot() reads
  // process.env synchronously as soon as it's evaluated.
  process.env.DATABASE_URL ??= 'postgres://demo:demo@localhost:5432/demo';
  process.env.LOG_LEVEL ??= 'info';
  // DemoConfig.PORT is only there to exercise config validation — this
  // fixture always binds an ephemeral OS port via app.listen(0, ...) below,
  // independent of whatever DemoConfig.PORT validates to.

  const app = await NestFactory.create<NestExpressApplication>(createDemoAppModule(), { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const drainPeriodMs = Number(process.env.SHUTDOWN_DRAIN_MS ?? '5000');
  const shutdownTimeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? '15000');

  installGracefulShutdown(app, app.get(PlatformHealthService), app.get(Logger), {
    drainPeriodMs,
    shutdownTimeoutMs,
  });

  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address ? address.port : 0;
  // The parent test process greps stdout for this exact line.
  process.stdout.write(`READY ${port}\n`);
}

main().catch((err) => {
  process.stderr.write(`shutdown-demo failed to boot: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
