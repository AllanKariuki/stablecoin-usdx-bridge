import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { createDemoAppModule } from './demo-app.module';

/**
 * Boots a real INestApplication for the demo app via @nestjs/testing's
 * Test.createTestingModule, the same way a service's own e2e suite would,
 * so every spec in this package asserts against real HTTP responses from a
 * genuinely wired module graph rather than a mocked-out unit.
 *
 * Callers must set the required env (setValidDemoEnv()) before calling this
 * — see createDemoAppModule()'s doc comment for why it can't be a static
 * import-time module.
 */
export async function bootstrapDemoApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [createDemoAppModule()] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  app.useLogger(app.get(Logger));
  await app.init();
  return app;
}

export function setValidDemoEnv(): void {
  process.env.DATABASE_URL = 'postgres://demo:demo@localhost:5432/demo';
  process.env.PORT = '8081';
  process.env.LOG_LEVEL = 'info';
}

export function clearDemoEnv(): void {
  delete process.env.DATABASE_URL;
  delete process.env.PORT;
  delete process.env.LOG_LEVEL;
}
