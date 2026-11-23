import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { createAppModule } from '../../src/app.module';
import { FakeKeycloak } from './fake-keycloak';

/**
 * Boots a real bff INestApplication against a given core-ledger base URL —
 * same pattern as @damp/nest-platform's own bootstrapDemoApp
 * (shared/node/nest-platform/test/fixtures/bootstrap.ts), so every spec
 * here asserts against real HTTP responses from a genuinely wired module
 * graph, not a mocked-out unit.
 *
 * H2: the app's ServiceTokenClient mints against a fake Keycloak token
 * endpoint, so the e2e specs exercise the same token plumbing production
 * uses (and the fake core-ledger can assert the Authorization header).
 *
 * H5: `kycUrl` points the KycGate at a fake kyc (see fake-kyc.ts). Specs
 * that exercise gated routes pass one; others leave it unset, which fails
 * the gated routes closed — and their operator/wallet routes still passing
 * is itself the assertion that those routes are not gated.
 */
export async function bootstrapBffApp(coreLedgerUrl: string, kycUrl?: string): Promise<NestExpressApplication> {
  process.env.CORE_LEDGER_URL = coreLedgerUrl;
  process.env.SERVICE_CLIENT_ID = 'svc-bff';
  process.env.SERVICE_CLIENT_SECRET = 'dev-svc-bff-secret';
  process.env.KEYCLOAK_BASE_URL = await FakeKeycloak.sharedUrl();
  process.env.KEYCLOAK_REALM = 'damp';
  process.env.LOG_LEVEL = 'error'; // quiet test output; access logs aren't the point of these specs
  process.env.PORT = '3002';
  if (kycUrl) process.env.KYC_URL = kycUrl;
  else delete process.env.KYC_URL;

  const moduleRef = await Test.createTestingModule({ imports: [createAppModule('test', 'test')] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  app.useLogger(app.get(Logger));
  await app.init();
  return app;
}
