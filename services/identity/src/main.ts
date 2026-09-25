import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { PlatformHealthService, installGracefulShutdown } from '@damp/nest-platform';
import { createAppModule } from './app.module';
import { IdentityConfig } from './config/identity-config';
import { DbService } from './db/db.service';

// Overridable at build time via --define / equivalent; "dev"/"none" for a
// plain `ts-node src/main.ts` — mirrors core-ledger/cmd/server/main.go's
// var (version, commit) pattern (see bff/src/main.ts for the sibling Node
// version of this).
const version = process.env.BUILD_VERSION ?? 'dev';
const commit = process.env.BUILD_COMMIT ?? 'none';

async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(createAppModule(version, commit), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<IdentityConfig, true>);
  const health = app.get(PlatformHealthService);
  const db = app.get(DbService);

  // Readiness reflects identity's own database, not core-ledger or
  // Keycloak — a core-ledger hiccup degrades wallet provisioning
  // (best-effort, see CoreLedgerClient) without making identity itself
  // unready, and Keycloak reachability only matters on an actual
  // cache-miss request, not as a standing health signal.
  health.addCheck('database', () => db.ping());

  installGracefulShutdown(app, health, app.get(Logger));

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  app.get(Logger).log(`identity listening on :${port}`);
}

main().catch((err) => {
  process.stderr.write(`identity failed to boot: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
