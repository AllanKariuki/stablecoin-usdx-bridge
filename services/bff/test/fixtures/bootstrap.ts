import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { createAppModule } from '../../src/app.module';

/**
 * Boots a real bff INestApplication against a given core-ledger base URL —
 * same pattern as @damp/nest-platform's own bootstrapDemoApp
 * (shared/node/nest-platform/test/fixtures/bootstrap.ts), so every spec
 * here asserts against real HTTP responses from a genuinely wired module
 * graph, not a mocked-out unit.
 */
export async function bootstrapBffApp(coreLedgerUrl: string): Promise<NestExpressApplication> {
  process.env.CORE_LEDGER_URL = coreLedgerUrl;
  process.env.LOG_LEVEL = 'error'; // quiet test output; access logs aren't the point of these specs
  process.env.PORT = '3002';

  const moduleRef = await Test.createTestingModule({ imports: [createAppModule('test', 'test')] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  app.useLogger(app.get(Logger));
  await app.init();
  return app;
}
