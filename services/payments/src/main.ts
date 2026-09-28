import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { PlatformHealthService, installGracefulShutdown } from '@damp/nest-platform';
import { createAppModule } from './app.module';
import { PaymentsConfig } from './config/payments-config';
import { DbService } from './db/db.service';

const version = process.env.BUILD_VERSION ?? 'dev';
const commit = process.env.BUILD_COMMIT ?? 'none';

async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(createAppModule(version, commit), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<PaymentsConfig, true>);
  const health = app.get(PlatformHealthService);
  const db = app.get(DbService);

  // Readiness reflects payments' own database *and* core-ledger, because
  // unlike rms this service cannot do its job without the ledger: an intent
  // that cannot settle is not degraded, it is stuck. A payments instance that
  // can't reach core-ledger should stop being handed new intents.
  health.addCheck('database', () => db.ping());
  health.addCheck('core-ledger', async () => {
    const res = await fetch(new URL('/healthz', config.get('CORE_LEDGER_URL', { infer: true })));
    if (!res.ok) throw new Error(`core-ledger /healthz returned ${res.status}`);
  });

  installGracefulShutdown(app, health, app.get(Logger));

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  app.get(Logger).log(`payments listening on :${port}`);
}

main().catch((err) => {
  process.stderr.write(`payments failed to boot: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
