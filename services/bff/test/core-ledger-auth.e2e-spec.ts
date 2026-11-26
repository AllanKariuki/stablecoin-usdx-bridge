import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { FakeCoreLedger } from './fixtures/fake-core-ledger';
import { FAKE_SERVICE_TOKEN, FakeKeycloak } from './fixtures/fake-keycloak';
import { bootstrapBffApp } from './fixtures/bootstrap';

/**
 * H2: every call bff makes to core-ledger — through CoreLedgerClient and
 * through the operator proxy — must carry bff's own service-account bearer
 * token, minted from Keycloak by the shared ServiceTokenClient and cached.
 */
describe('bff -> core-ledger authorization (e2e)', () => {
  let coreLedger: FakeCoreLedger;
  let app: NestExpressApplication;

  beforeAll(async () => {
    coreLedger = new FakeCoreLedger();
    const url = await coreLedger.listen();
    app = await bootstrapBffApp(url);
  });

  afterAll(async () => {
    await app.close();
    await coreLedger.close();
  });

  it('attaches the service-account bearer to CoreLedgerClient calls', async () => {
    await request(app.getHttpServer())
      .get('/wallets')
      .set('x-user-id', 'alice')
      .expect(200);

    expect(coreLedger.lastAuth).toBe(`Bearer ${FAKE_SERVICE_TOKEN}`);
  });

  it('attaches the service-account bearer to the operator proxy', async () => {
    // GET /accounts goes straight through CoreLedgerOperationsProxyController;
    // the fake has no such route (404), but the Authorization header still
    // has to arrive for the assertion.
    await request(app.getHttpServer())
      .get('/accounts')
      .set('x-user-id', 'treasury-1')
      .expect(404);

    expect(coreLedger.lastAuth).toBe(`Bearer ${FAKE_SERVICE_TOKEN}`);
  });

  it('mints the token once and reuses it across calls', async () => {
    await request(app.getHttpServer()).get('/wallets').set('x-user-id', 'alice').expect(200);
    await request(app.getHttpServer()).get('/wallets').set('x-user-id', 'alice').expect(200);

    // Every call carried the cached token, and the fake Keycloak served
    // exactly one client-credentials grant for the whole spec.
    expect(coreLedger.lastAuth).toBe(`Bearer ${FAKE_SERVICE_TOKEN}`);
    expect(FakeKeycloak.sharedGrants()).toBe(1);
  });
});
