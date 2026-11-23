import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { FakeIssuer } from '@damp/nest-platform';
import { createAppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { TiersRepository } from '../src/tiers/tiers.repository';
import { CasesService } from '../src/cases/cases.service';

/**
 * H5's money-path endpoint: GET /internal/parties/:partyId/tier.
 *
 * Boots the real kyc app with the H3 service guard against a FakeIssuer and
 * asserts the boundary itself: no token -> 401, a token that holds only
 * kyc.user-proxy -> 403 FORBIDDEN (the role does NOT reach this route), and
 * kyc.tier-read -> the tier view with the full ordered tier list. A party
 * with no record answers TIER_0 (rank 0) — the default that makes an
 * unknown party able to move nothing by construction.
 *
 * DbService, TiersRepository and CasesService are overridden so the spec
 * needs no Postgres: the guard and the route wiring are what is under test.
 */
describe('kyc internal tier endpoint (e2e, FakeIssuer, overridden repositories)', () => {
  let issuer: FakeIssuer;
  let app: NestExpressApplication;

  const fakeTiers = [
    { name: 'TIER_0', rank: 0 },
    { name: 'TIER_1', rank: 1 },
    { name: 'TIER_2', rank: 2 },
  ];

  beforeAll(async () => {
    issuer = await FakeIssuer.start({ audience: 'kyc' });
    process.env.PORT = '3007';
    process.env.LOG_LEVEL = 'error';
    process.env.DATABASE_URL = 'postgres://unused:unused@127.0.0.1:1/unused';
    process.env.CORE_LEDGER_URL = 'http://127.0.0.1:1';
    process.env.SERVICE_CLIENT_ID = 'svc-kyc';
    process.env.SERVICE_CLIENT_SECRET = 'dev-svc-kyc-secret';
    process.env.KEYCLOAK_BASE_URL = 'http://127.0.0.1:1';
    process.env.KEYCLOAK_REALM = 'damp';
    process.env.AUTH_ISSUER_URL = issuer.issuerUrl;
    process.env.AUTH_AUDIENCE = 'kyc';

    const moduleRef = await Test.createTestingModule({ imports: [createAppModule('test', 'test')] })
      .overrideProvider(DbService)
      .useValue({ query: jest.fn(async () => ({ rows: [] })), transaction: jest.fn() })
      .overrideProvider(TiersRepository)
      .useValue({
        tierFor: jest.fn(async (partyId: string) => {
          const known: Record<string, { name: string; rank: number }> = {
            party_1: { name: 'TIER_2', rank: 2 },
            party_0: { name: 'TIER_0', rank: 0 },
          };
          return known[partyId] ?? { name: 'TIER_0', rank: 0 };
        }),
        all: jest.fn(async () => fakeTiers),
      })
      .overrideProvider(CasesService)
      .useValue({
        openCaseFor: jest.fn(async (partyId: string) => (partyId === 'party_pending' ? { status: 'PENDING_APPROVAL' } : null)),
      })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await issuer.close();
  });

  it('401s without a token', async () => {
    await request(app.getHttpServer()).get('/internal/parties/party_1/tier').expect(401);
  });

  it('403s for a caller holding only kyc.user-proxy — the user-facing role does not reach this route', async () => {
    const token = await issuer.mint({
      azp: 'svc-bff',
      resource_access: { kyc: { roles: ['kyc.user-proxy'] } },
    });
    const res = await request(app.getHttpServer())
      .get('/internal/parties/party_1/tier')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('answers the tier and the full ordered tier list for a kyc.tier-read caller', async () => {
    const token = await issuer.mint({
      azp: 'svc-payments',
      resource_access: { kyc: { roles: ['kyc.tier-read'] } },
    });
    const res = await request(app.getHttpServer())
      .get('/internal/parties/party_1/tier')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.partyId).toBe('party_1');
    expect(res.body.tier).toEqual({ name: 'TIER_2', rank: 2 });
    expect(res.body.status).toBeNull();
    expect(res.body.tiers).toEqual(fakeTiers);
  });

  it('answers rank 0 (TIER_0) for a party with no record', async () => {
    const token = await issuer.mint({
      azp: 'svc-payments',
      resource_access: { kyc: { roles: ['kyc.tier-read'] } },
    });
    const res = await request(app.getHttpServer())
      .get('/internal/parties/nobody/tier')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.partyId).toBe('nobody');
    expect(res.body.tier).toEqual({ name: 'TIER_0', rank: 0 });
  });

  it('reports the open case status when one exists', async () => {
    const token = await issuer.mint({
      azp: 'svc-bff',
      resource_access: { kyc: { roles: ['kyc.tier-read'] } },
    });
    const res = await request(app.getHttpServer())
      .get('/internal/parties/party_pending/tier')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.status).toBe('PENDING_APPROVAL');
  });
});
