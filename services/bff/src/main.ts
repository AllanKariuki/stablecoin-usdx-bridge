import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { PlatformHealthService, installGracefulShutdown } from '@damp/nest-platform';
import { createAppModule } from './app.module';
import { BffConfig } from './config/bff-config';

// Overridable at build time via
// --define:__VERSION__=\"...\" or equivalent; "dev"/"none" for a plain
// `ts-node src/main.ts` — mirrors core-ledger/cmd/server/main.go's
// var (version, commit) pattern.
const version = process.env.BUILD_VERSION ?? 'dev';
const commit = process.env.BUILD_COMMIT ?? 'none';

async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(createAppModule(version, commit), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<BffConfig, true>);
  const health = app.get(PlatformHealthService);
  const coreLedgerUrl = config.get('CORE_LEDGER_URL', { infer: true });

  // Readiness reflects core-ledger reachability — bff has nothing useful
  // to serve without it, so a bff instance that can't reach core-ledger
  // should stop receiving traffic the same way core-ledger's own /readyz
  // degrades when Postgres is unreachable (shared/go/platform/health.go).
  health.addCheck('core-ledger', async () => {
    const res = await fetch(new URL('/healthz', coreLedgerUrl));
    if (!res.ok) {
      throw new Error(`core-ledger /healthz returned ${res.status}`);
    }
  });

  installGracefulShutdown(app, health, app.get(Logger));

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  app.get(Logger).log(`bff listening on :${port}`);
}

main().catch((err) => {
  process.stderr.write(`bff failed to boot: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
