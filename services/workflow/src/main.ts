import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { PlatformHealthService, installGracefulShutdown } from '@damp/nest-platform';
import { createAppModule } from './app.module';
import { WorkflowConfig } from './config/workflow-config';
import { DbService } from './db/db.service';

const version = process.env.BUILD_VERSION ?? 'dev';
const commit = process.env.BUILD_COMMIT ?? 'none';

async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(createAppModule(version, commit), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<WorkflowConfig, true>);
  const health = app.get(PlatformHealthService);
  const db = app.get(DbService);

  health.addCheck('database', () => db.ping());

  installGracefulShutdown(app, health, app.get(Logger));

  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  app.get(Logger).log(`workflow listening on :${port}`);
}

main().catch((err) => {
  process.stderr.write(`workflow failed to boot: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
