import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { PlatformHealthService, installGracefulShutdown } from '@damp/nest-platform';
import { createAppModule } from './app.module';
import { PricingConfig } from './config/pricing-config';
import { DbService } from './db/db.service';

const version = process.env.BUILD_VERSION ?? 'dev';
const commit = process.env.BUILD_COMMIT ?? 'none';

async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(createAppModule(version, commit), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<PricingConfig, true>);
  const health = app.get(PlatformHealthService);
  const db = app.get(DbService);

  // Readiness reflects pricing's own database only. A core-ledger hiccup
  // stalls a quote request — which a caller retries with a fresh quote,
  // losing nothing by design — and must not take this service out of
  // rotation for the rates board the consoles are looking at.
  health.addCheck('database', () => db.ping());

  installGracefulShutdown(app, health, app.get(Logger));

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  app.get(Logger).log(`pricing listening on :${port}`);
}

main().catch((err) => {
  process.stderr.write(`pricing failed to boot: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
