import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { PlatformException } from '@damp/nest-platform';
import { FakeIssuer } from '@damp/nest-platform';
import { createAppModule } from '../src/app.module';
import { CoreLedgerClient } from '../src/core-ledger/core-ledger.client';
import { DbService } from '../src/db/db.service';
import { EXPOSURE_GUARD } from '../src/exposure/exposure-guard';
import { PairsRepository, PricingPair } from '../src/pairs/pairs.repository';
import { Aggregator } from '../src/rates/aggregator';

/**
 * POST /quotes end to end: the real app, the real H3 service guard against
 * a FakeIssuer, the real aggregator fed by the StubFeed, and everything
 * that is not under test — core-ledger, the database, the exposure guard —
 * overridden. No network, no Postgres.
 *
 * The role boundary is part of what is under test: no token -> 401, the
 * wrong pricing role -> 403 FORBIDDEN, and the right role reaches the
 * route. This mirrors kyc's internal-tiers e2e, the in-repo pattern for
 * role-enforced service routes.
 */

const PAIR: PricingPair = {
  baseCcy: 'BTC',
  quoteCcy: 'USD',
  spreadBps: 100,
  ttlSeconds: 30,
  enabled: true,
  maxNotionalUsd: '10000',
  updatedAt: '',
  updatedBy: '',
};

describe('pricing quotes endpoint (e2e, FakeIssuer, overridden ledger/guard/db)', () => {
  let issuer: FakeIssuer;
  let app: NestExpressApplication;

  const ledgerCalls: Array<Record<string, unknown>> = [];
  const guardChecks: Array<{ notionalUsd: string; partyId: string }> = [];
  const issueCalls: Array<{ quoteId: string; expiresAt: string }> = [];
  let guardBehavior: 'allow' | 'over-max' | 'outstanding-cap' = 'allow';

  beforeAll(async () => {
    issuer = await FakeIssuer.start({ audience: 'pricing' });
    process.env.PORT = '3006';
    process.env.LOG_LEVEL = 'error';
    process.env.DATABASE_URL = 'postgres://unused:unused@127.0.0.1:1/unused';
    process.env.CORE_LEDGER_URL = 'http://127.0.0.1:1';
    process.env.SERVICE_CLIENT_ID = 'svc-pricing';
    process.env.SERVICE_CLIENT_SECRET = 'dev-svc-pricing-secret';
    process.env.KEYCLOAK_BASE_URL = 'http://127.0.0.1:1';
    process.env.KEYCLOAK_REALM = 'damp';
    process.env.AUTH_ISSUER_URL = issuer.issuerUrl;
    process.env.AUTH_AUDIENCE = 'pricing';
    process.env.AUDIT_TRAIL_URL = '';
    process.env.PRICING_FEEDS = 'stub';
    process.env.PRICING_STUB_RATES =
      '{"BTC/USD":"100000.00","ETH/USD":"3500.00","SOL/USD":"200.00","USD/EUR":"0.92","USD/GBP":"0.79","USD/KES":"129.50"}';
    process.env.PRICING_POLL_MS = '60000';
    // The stub is a single feed, so the two-source crypto minimum can never
    // be met in this spec — min-sources is the aggregator spec's subject,
    // not the quote pipeline's. Same override scripts/stack.sh applies to
    // the stub-only local stack.
    process.env.PRICING_MIN_SOURCES = '1';

    const moduleRef = await Test.createTestingModule({ imports: [createAppModule('test', 'test')] })
      .overrideProvider(DbService)
      .useValue({
        query: jest.fn(async () => ({ rows: [] })),
        transaction: jest.fn(async (fn: (q: unknown) => Promise<unknown>) => fn({ query: jest.fn(async () => ({ rows: [] })) })),
      })
      .overrideProvider(CoreLedgerClient)
      .useValue({
        createQuote: jest.fn(async (input: Record<string, unknown>) => {
          ledgerCalls.push(input);
          return {
            id: 'q-1',
            base_currency: input.baseCcy,
            quote_currency: input.quoteCcy,
            rate: input.rate,
            spread_bps: input.spreadBps,
            from_amount: input.fromAmount,
            party_id: input.partyId,
            expires_at: new Date(Date.now() + 30000).toISOString(),
          };
        }),
      })
      .overrideProvider(PairsRepository)
      .useValue({
        find: jest.fn(async (_base: string, _quote: string) => ({ ...PAIR })),
        list: jest.fn(async () => [PAIR]),
        update: jest.fn(),
      })
      .overrideProvider(EXPOSURE_GUARD)
      .useValue({
        reserve: jest.fn(async (_pair: PricingPair, notionalUsd: string, partyId: string) => {
          guardChecks.push({ notionalUsd, partyId });
          if (guardBehavior === 'over-max') {
            throw new PlatformException(HttpStatus.UNPROCESSABLE_ENTITY, 'NOTIONAL_OVER_MAX', 'over the pair cap');
          }
          if (guardBehavior === 'outstanding-cap') {
            throw new PlatformException(HttpStatus.UNPROCESSABLE_ENTITY, 'PARTY_OUTSTANDING_CAP_EXCEEDED', 'over the outstanding cap');
          }
          return {
            issue: jest.fn(async (quoteId: string, expiresAt: string) => {
              issueCalls.push({ quoteId, expiresAt });
            }),
            cancel: jest.fn(async () => undefined),
          };
        }),
      })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    await app.init();

    // The stub feed is polled at init; one explicit poll makes the data
    // deterministic before the first request.
    await app.get(Aggregator).pollNow();
  });

  afterAll(async () => {
    await app.close();
    await issuer.close();
  });

  beforeEach(() => {
    ledgerCalls.length = 0;
    guardChecks.length = 0;
    issueCalls.length = 0;
    guardBehavior = 'allow';
  });

  async function token(roles: string[], azp = 'svc-bff'): Promise<string> {
    return issuer.mint({ azp, resource_access: { pricing: { roles } } });
  }

  describe('the role boundary', () => {
    it('401s without a token', async () => {
      await request(app.getHttpServer())
        .post('/quotes')
        .send({ from: 'BTC', to: 'USD', amount: '0.01', party_id: 'party_1' })
        .expect(401);
    });

    it('403s for a caller holding pricing.read but not pricing.quote', async () => {
      const res = await request(app.getHttpServer())
        .post('/quotes')
        .set('Authorization', `Bearer ${await token(['pricing.read'])}`)
        .send({ from: 'BTC', to: 'USD', amount: '0.01', party_id: 'party_1' })
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('403s for a quote-role caller on the rates board', async () => {
      const res = await request(app.getHttpServer())
        .get('/rates')
        .set('Authorization', `Bearer ${await token(['pricing.quote'])}`)
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('403s for a non-admin caller on PATCH /pairs', async () => {
      const res = await request(app.getHttpServer())
        .patch('/pairs/BTC/USD')
        .set('Authorization', `Bearer ${await token(['pricing.read'])}`)
        .send({ spread_bps: 75 })
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('serves the rates board and the pair list to a pricing.read caller', async () => {
      const auth = `Bearer ${await token(['pricing.read'], 'svc-payments')}`;

      const rates = await request(app.getHttpServer()).get('/rates').set('Authorization', auth).expect(200);
      expect(rates.body.base).toBe('USD');
      const btc = rates.body.entries.find((e: { currency: string }) => e.currency === 'BTC');
      // 1 base USD = 0.00001 BTC: the board quotes each currency *against*
      // the base, which for a crypto currency is the inverted leg.
      expect(btc).toMatchObject({ status: 'OK', rate: '0.00001', sources: ['stub'] });

      const pairs = await request(app.getHttpServer()).get('/pairs').set('Authorization', auth).expect(200);
      expect(pairs.body.pairs).toHaveLength(1);
    });
  });

  describe('POST /quotes', () => {
    const body = { from: 'BTC', to: 'USD', amount: '0.01', party_id: 'party_1' };

    it('mints a pinned quote and previews the ledger-exact numbers', async () => {
      const res = await request(app.getHttpServer())
        .post('/quotes')
        .set('Authorization', `Bearer ${await token(['pricing.quote'], 'svc-payments')}`)
        .send(body)
        .expect(201);

      expect(res.body).toMatchObject({
        quote_id: 'q-1',
        from: 'BTC',
        to: 'USD',
        // Normalized to the currency's own scale — the same padding the
        // ledger echoes back from FormatDecimal.
        amount: '0.01000000',
        rate: '100000',
        spread_bps: 100,
        gross: '1000.00',
        fee: '10.00',
        net: '990.00',
        sources: ['stub'],
      });
      expect(res.body.expires_at).toBeDefined();

      // The ledger was told exactly what the pair policy and aggregator
      // decided — mid rate, spread, TTL, and the two pins.
      expect(ledgerCalls[0]).toEqual({
        baseCcy: 'BTC',
        quoteCcy: 'USD',
        rate: '100000',
        spreadBps: 100,
        source: 'pricing:stub',
        ttlSeconds: 30,
        fromAmount: '0.01000000',
        partyId: 'party_1',
      });

      // The exposure guard saw the USD notional before anything was minted.
      expect(guardChecks).toEqual([{ notionalUsd: '1000.00', partyId: 'party_1' }]);

      // ...and the reservation was flipped to ISSUED with the ledger's id
      // and expiry, so the outstanding cap counts it going forward.
      expect(issueCalls).toEqual([{ quoteId: 'q-1', expiresAt: expect.any(String) }]);
    });

    it('refuses USD-X with USDX_USES_ISSUANCE before touching the ledger', async () => {
      for (const bad of [
        { from: 'USDX', to: 'USD' },
        { from: 'USD', to: 'USDX' },
        { from: 'usdx', to: 'kes' },
      ]) {
        const res = await request(app.getHttpServer())
          .post('/quotes')
          .set('Authorization', `Bearer ${await token(['pricing.quote'])}`)
          .send({ ...body, ...bad })
          .expect(422);
        expect(res.body.code).toBe('USDX_USES_ISSUANCE');
      }
      expect(ledgerCalls).toHaveLength(0);
    });

    it('refuses a same-currency pair', async () => {
      const res = await request(app.getHttpServer())
        .post('/quotes')
        .set('Authorization', `Bearer ${await token(['pricing.quote'])}`)
        .send({ ...body, from: 'KES', to: 'kes' })
        .expect(422);
      expect(res.body.code).toBe('SAME_CURRENCY');
      expect(ledgerCalls).toHaveLength(0);
    });

    it('refuses an unknown currency', async () => {
      const res = await request(app.getHttpServer())
        .post('/quotes')
        .set('Authorization', `Bearer ${await token(['pricing.quote'])}`)
        .send({ ...body, from: 'DOGE' })
        .expect(422);
      expect(res.body.code).toBe('UNSUPPORTED_PAIR');
      expect(ledgerCalls).toHaveLength(0);
    });

    it('refuses an amount with more precision than the currency has', async () => {
      const res = await request(app.getHttpServer())
        .post('/quotes')
        .set('Authorization', `Bearer ${await token(['pricing.quote'])}`)
        .send({ from: 'USD', to: 'KES', amount: '0.001', party_id: 'party_1' }) // USD has 2dp
        .expect(422);
      expect(res.body.code).toBe('INVALID_AMOUNT');
      expect(ledgerCalls).toHaveLength(0);
    });

    it('refuses a zero amount', async () => {
      const res = await request(app.getHttpServer())
        .post('/quotes')
        .set('Authorization', `Bearer ${await token(['pricing.quote'])}`)
        .send({ ...body, amount: '0' })
        .expect(422);
      expect(res.body.code).toBe('INVALID_AMOUNT');
      expect(ledgerCalls).toHaveLength(0);
    });

    it('refuses when the exposure guard says the notional is over the pair cap', async () => {
      guardBehavior = 'over-max';
      const res = await request(app.getHttpServer())
        .post('/quotes')
        .set('Authorization', `Bearer ${await token(['pricing.quote'])}`)
        .send(body)
        .expect(422);
      expect(res.body.code).toBe('NOTIONAL_OVER_MAX');
      expect(ledgerCalls).toHaveLength(0);
    });

    it('refuses when the exposure guard says the outstanding cap is exceeded', async () => {
      guardBehavior = 'outstanding-cap';
      const res = await request(app.getHttpServer())
        .post('/quotes')
        .set('Authorization', `Bearer ${await token(['pricing.quote'])}`)
        .send(body)
        .expect(422);
      expect(res.body.code).toBe('PARTY_OUTSTANDING_CAP_EXCEEDED');
      expect(ledgerCalls).toHaveLength(0);
    });

    it('400s a body without party_id — quotes are pinned', async () => {
      await request(app.getHttpServer())
        .post('/quotes')
        .set('Authorization', `Bearer ${await token(['pricing.quote'])}`)
        .send({ from: 'BTC', to: 'USD', amount: '0.01' })
        .expect(400);
      expect(ledgerCalls).toHaveLength(0);
    });
  });
});
