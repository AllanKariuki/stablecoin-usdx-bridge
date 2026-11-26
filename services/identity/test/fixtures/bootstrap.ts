import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { FakeIssuer } from '@damp/nest-platform';
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
 *
 * Since H3 the app's ServiceAuthGuard is live, so the fixture also stands up
 * an in-process OIDC issuer (nest-platform's FakeIssuer) and points
 * AUTH_ISSUER_URL at it. Tests mint tokens with identityToken() and send
 * them on every request.
 */
let issuer: FakeIssuer | null = null;

export async function bootstrapIdentityApp(
  keycloakUrl: string,
  coreLedgerUrl: string,
): Promise<NestExpressApplication> {
  await closeIdentityIssuer();
  issuer = await FakeIssuer.start({ audience: 'identity' });

  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.KEYCLOAK_BASE_URL = keycloakUrl;
  process.env.KEYCLOAK_REALM = 'damp';
  process.env.SERVICE_CLIENT_ID = 'identity-service';
  process.env.SERVICE_CLIENT_SECRET = 'test-secret';
  process.env.CORE_LEDGER_URL = coreLedgerUrl;
  process.env.AUTH_ISSUER_URL = issuer.issuerUrl;
  process.env.AUTH_AUDIENCE = 'identity';
  process.env.LOG_LEVEL = 'error'; // quiet test output; access logs aren't the point of these specs
  process.env.PORT = '3001';

  await resetSchema();

  const moduleRef = await Test.createTestingModule({ imports: [createAppModule('test', 'test')] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  app.useLogger(app.get(Logger));
  await app.init();
  return app;
}

/** A service token for this fixture's issuer, carrying identity client roles
 * for whatever caller the test is pretending to be (svc-bff for user-proxy,
 * svc-auth-proxy/svc-notifications for identity.resolve). */
export async function identityToken(roles: string[], azp = 'svc-bff'): Promise<string> {
  if (!issuer) throw new Error('bootstrapIdentityApp must run before identityToken');
  return issuer.mint({ azp, resource_access: { identity: { roles } } });
}

export async function closeIdentityIssuer(): Promise<void> {
  await issuer?.close();
  issuer = null;
}

async function resetSchema(): Promise<void> {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await pool.query('DROP TABLE IF EXISTS memberships, orgs, parties, audit_outbox, schema_migrations CASCADE');
  } finally {
    await pool.end();
  }
}
