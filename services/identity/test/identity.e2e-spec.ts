import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { bootstrapIdentityApp } from './fixtures/bootstrap';
import { FakeCoreLedger } from './fixtures/fake-core-ledger';
import { FakeKeycloak } from './fixtures/fake-keycloak';

describe('identity (e2e, against a fake Keycloak + fake core-ledger, real Postgres)', () => {
  let keycloak: FakeKeycloak;
  let coreLedger: FakeCoreLedger;
  let app: NestExpressApplication;

  beforeAll(async () => {
    keycloak = new FakeKeycloak();
    keycloak.seedUser({
      id: 'kc-alice',
      username: 'alice',
      email: 'alice@damp.local',
      firstName: 'Alice',
      lastName: 'A',
    });
    keycloak.seedUser({
      id: 'kc-bob',
      username: 'bob',
      email: 'bob@damp-demo.co',
      firstName: 'Bob',
      lastName: 'B',
      attributes: { org_id: ['org_demo_co'] },
      groups: [{ id: 'g1', name: 'damp-demo-co', path: '/orgs/damp-demo-co' }],
    });
    const keycloakUrl = await keycloak.listen();

    coreLedger = new FakeCoreLedger();
    const coreLedgerUrl = await coreLedger.listen();

    app = await bootstrapIdentityApp(keycloakUrl, coreLedgerUrl);
  });

  afterAll(async () => {
    await app.close();
    await keycloak.close();
    await coreLedger.close();
  });

  it('provisions a PERSON party on first resolve and ensures a default wallet', async () => {
    const res = await request(app.getHttpServer()).get('/internal/parties/by-subject/kc-alice').expect(200);

    expect(res.body.party_id).toMatch(/^party_/);
    expect(res.body.org_id).toBe('');
    expect(coreLedger.walletRequests).toContainEqual({ user_id: res.body.party_id, currency: 'USD' });

    const party = await request(app.getHttpServer()).get(`/parties/${res.body.party_id}`).expect(200);
    expect(party.body.type).toBe('PERSON');
    expect(party.body.email).toBe('alice@damp.local');
  });

  it('is idempotent: a second resolve returns the same party id with no repeat wallet-ensure call', async () => {
    const first = await request(app.getHttpServer()).get('/internal/parties/by-subject/kc-alice').expect(200);
    const walletCallsBefore = coreLedger.walletRequests.length;

    const second = await request(app.getHttpServer()).get('/internal/parties/by-subject/kc-alice').expect(200);

    expect(second.body.party_id).toBe(first.body.party_id);
    expect(coreLedger.walletRequests.length).toBe(walletCallsBefore);
  });

  it('provisions an ORGANIZATION party with an org membership when Keycloak reports org_id', async () => {
    const res = await request(app.getHttpServer()).get('/internal/parties/by-subject/kc-bob').expect(200);

    expect(res.body.party_id).toMatch(/^party_/);
    expect(res.body.org_id).toMatch(/^org_/);

    const party = await request(app.getHttpServer()).get(`/parties/${res.body.party_id}`).expect(200);
    expect(party.body.type).toBe('ORGANIZATION');
  });

  it('GET /parties/:id 404s for an unknown id', async () => {
    await request(app.getHttpServer()).get('/parties/does-not-exist').expect(404);
  });
});
