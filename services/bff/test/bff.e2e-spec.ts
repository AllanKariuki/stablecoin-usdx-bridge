import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { FakeCoreLedger } from './fixtures/fake-core-ledger';
import { bootstrapBffApp } from './fixtures/bootstrap';

describe('bff (e2e, against a fake core-ledger)', () => {
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

  const authHeaders = (userId: string, permissions: string[] = []) => ({
    'x-user-id': userId,
    'x-permissions': permissions.join(','),
  });

  it('rejects a request with no X-User-Id header', async () => {
    await request(app.getHttpServer()).get('/wallets').expect(401).expect((res) => {
      expect(res.body.code).toBe('MISSING_IDENTITY');
      expect(res.body.error).toBeDefined();
    });
  });

  it('GET /wallets auto-provisions a default wallet and returns camelCase + Money', async () => {
    const res = await request(app.getHttpServer())
      .get('/wallets')
      .set(authHeaders('alice'))
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const wallet = res.body[0];
    // camelCase, not core-ledger's snake_case
    expect(wallet.userId).toBe('alice');
    expect(wallet.user_id).toBeUndefined();
    // Money shape, never a bare number
    expect(typeof wallet.balance.amount).toBe('string');
    expect(wallet.balance.currency).toBe('USD');
    expect(wallet.balance.decimals).toBe(2);
    expect(wallet.balance.display).toBe('$0.00');
  });

  it('GET /wallets/:id on another user\'s wallet is forbidden without a *:any permission', async () => {
    const aliceWallets = await request(app.getHttpServer()).get('/wallets').set(authHeaders('alice')).expect(200);
    const walletId = aliceWallets.body[0].id;

    await request(app.getHttpServer())
      .get(`/wallets/${walletId}`)
      .set(authHeaders('bob'))
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe('FORBIDDEN');
      });
  });

  it("GET /wallets/:id on another user's wallet succeeds with wallets:read:any", async () => {
    const aliceWallets = await request(app.getHttpServer()).get('/wallets').set(authHeaders('alice')).expect(200);
    const walletId = aliceWallets.body[0].id;

    await request(app.getHttpServer())
      .get(`/wallets/${walletId}`)
      .set(authHeaders('auditor-bob', ['wallets:read:any']))
      .expect(200);
  });

  it('POST /deposits requires an Idempotency-Key header', async () => {
    const wallets = await request(app.getHttpServer()).get('/wallets').set(authHeaders('carol')).expect(200);
    const walletId = wallets.body[0].id;

    await request(app.getHttpServer())
      .post('/deposits')
      .set(authHeaders('carol'))
      .send({ walletId, amount: '10.00' })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
      });
  });

  it('POST /deposits succeeds and returns a Money-shaped transaction', async () => {
    const wallets = await request(app.getHttpServer()).get('/wallets').set(authHeaders('dave')).expect(200);
    const walletId = wallets.body[0].id;

    const res = await request(app.getHttpServer())
      .post('/deposits')
      .set({ ...authHeaders('dave'), 'idempotency-key': 'test-key-1' })
      .send({ walletId, amount: '25.00', reference: 'test' })
      .expect(201);

    expect(res.body.entries[0].amount.amount).toBe('25.00');
    expect(res.body.entries[0].amount.display).toBe('$25.00');
    expect(res.body.createdAt).toBeDefined();
  });

  it('GET /dashboard aggregates wallets and recent transactions in one call', async () => {
    // Seed a wallet + a transaction for this user first.
    const wallets = await request(app.getHttpServer()).get('/wallets').set(authHeaders('erin')).expect(200);
    const walletId = wallets.body[0].id;
    await request(app.getHttpServer())
      .post('/deposits')
      .set({ ...authHeaders('erin'), 'idempotency-key': 'test-key-2' })
      .send({ walletId, amount: '5.00' })
      .expect(201);

    const res = await request(app.getHttpServer()).get('/dashboard').set(authHeaders('erin')).expect(200);
    expect(res.body.wallets.length).toBeGreaterThanOrEqual(1);
    expect(res.body.recentTransactions.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /transactions/:id requires transactions:read:any', async () => {
    await request(app.getHttpServer())
      .get('/transactions/tx-1')
      .set(authHeaders('frank'))
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
      });
  });

  it('propagates a core-ledger error through the same {error, code, request_id} envelope', async () => {
    await request(app.getHttpServer())
      .get('/wallets/does-not-exist')
      .set(authHeaders('grace', ['wallets:read:any']))
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe('UNKNOWN_WALLET');
        expect(res.body.request_id).toBeDefined();
      });
  });
});
