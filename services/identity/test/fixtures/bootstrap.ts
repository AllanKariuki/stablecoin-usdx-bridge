import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { Pool } from 'pg';
import { createAppModule } from '../../src/app.module';

const TEST_DATABASE_URL =
  process.env.IDENTITY_TEST_DATABASE_URL ??
  'postgres://identity:identity@localhost:55433/identity_test?sslmode=disable';

/**
 * Boots a real identity INestApplication against a fake Keycloak + fake
 * core-ledger, but a REAL Postgres — same reasoning as core-ledger's own
 * integration tests (LEDGER_TEST_DATABASE_URL): the migration runner and
 * every query in the parties/orgs/memberships repositories deserve to run
 * for real, not against a mock. Drops identity's tables first so specs
 * don't leak state across test runs (DbService.onModuleInit re-applies
 * migrations on every app.init()).
 */
export async function bootstrapIdentityApp(
  keycloakUrl: string,
  coreLedgerUrl: string,
): Promise<NestExpressApplication> {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.KEYCLOAK_BASE_URL = keycloakUrl;
  process.env.KEYCLOAK_REALM = 'damp';
  process.env.KEYCLOAK_ADMIN_CLIENT_ID = 'identity-service';
  process.env.KEYCLOAK_ADMIN_CLIENT_SECRET = 'test-secret';
  process.env.CORE_LEDGER_URL = coreLedgerUrl;
  process.env.LOG_LEVEL = 'error'; // quiet test output; access logs aren't the point of these specs
  process.env.PORT = '3001';

  await resetSchema();

  const moduleRef = await Test.createTestingModule({ imports: [createAppModule('test', 'test')] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  app.useLogger(app.get(Logger));
  await app.init();
  return app;
}

async function resetSchema(): Promise<void> {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await pool.query('DROP TABLE IF EXISTS memberships, orgs, parties, schema_migrations CASCADE');
  } finally {
    await pool.end();
  }
}
