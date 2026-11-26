import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { FakeCoreLedger } from './fixtures/fake-core-ledger';
import { FakeKyc } from './fixtures/fake-kyc';
import { bootstrapBffApp } from './fixtures/bootstrap';

const ETH_ADDRESS = '0x4e29A6a3689F37db9a93985A0f6424420cc2CD49';

describe('bff issuance/redemption (e2e, against a fake core-ledger)', () => {
  let coreLedger: FakeCoreLedger;
  let kyc: FakeKyc;
  let app: NestExpressApplication;

  beforeAll(async () => {
    coreLedger = new FakeCoreLedger();
    const url = await coreLedger.listen();
    kyc = new FakeKyc();
    const kycUrl = await kyc.listen();
    app = await bootstrapBffApp(url, kycUrl);
  });

  afterAll(async () => {
    await app.close();
    await coreLedger.close();
    await kyc.close();
  });

  const as = (userId: string, permissions: string[] = []) => ({
    'x-user-id': userId,
    'x-permissions': permissions.join(','),
  });

  async function walletsFor(userId: string): Promise<{ fiatId: string; usdxId: string }> {
    const fiat = await request(app.getHttpServer()).get('/wallets').set(as(userId)).expect(200);
    const usdx = await request(app.getHttpServer())
      .post('/wallets/usdx')
      .set(as(userId))
      .send({ chain: 'ETHEREUM', address: ETH_ADDRESS })
      .expect(201);
    return { fiatId: fiat.body[0].id, usdxId: usdx.body.id };
  }

  it('POST /wallets/usdx opens a USD-X wallet for the caller, idempotently', async () => {
    const first = await request(app.getHttpServer())
      .post('/wallets/usdx')
      .set(as('ivy'))
      .send({ chain: 'ETHEREUM', address: ETH_ADDRESS })
      .expect(201);
    expect(first.body.userId).toBe('ivy');
    expect(first.body.currency).toBe('USDX');
    expect(first.body.chain).toBe('ETHEREUM');
    expect(first.body.balance.decimals).toBe(6);

    const second = await request(app.getHttpServer())
      .post('/wallets/usdx')
      .set(as('ivy'))
      .send({ chain: 'ETHEREUM', address: ETH_ADDRESS })
      .expect(201);
    expect(second.body.id).toBe(first.body.id);
  });

  it('POST /wallets/usdx requires a chain', async () => {
    await request(app.getHttpServer()).post('/wallets/usdx').set(as('ivy')).send({}).expect(400);
  });

  it('POST /issuances requires an Idempotency-Key', async () => {
    const { fiatId, usdxId } = await walletsFor('jack');
    await request(app.getHttpServer())
      .post('/issuances')
      .set(as('jack'))
      .send({ fiatWalletId: fiatId, usdxWalletId: usdxId, amount: '250.00' })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY'));
  });

  it('POST /issuances answers 202 with the journal entry and a saga handle, stamping the caller as actor', async () => {
    kyc.setTier('kate', 'TIER_1');
    const { fiatId, usdxId } = await walletsFor('kate');
    const res = await request(app.getHttpServer())
      .post('/issuances')
      .set({ ...as('kate'), 'idempotency-key': 'issue-kate-1' })
      .send({ fiatWalletId: fiatId, usdxWalletId: usdxId, amount: '250.00' })
      .expect(202);

    expect(res.body.correlationId).toBe('corr-issue-kate-1');
    expect(res.body.sagaStatus).toBe('PENDING');
    expect(res.body.transaction.entries[0].amount.display).toBe('$250.00');
    expect(coreLedger.lastActor).toBe('kate');
  });

  it("refuses to mint to another user's USD-X wallet", async () => {
    // At the minimum tier, so the refusal asserted here is the ownership
    // check — the KYC gate passes and never masks it.
    kyc.setTier('mallory', 'TIER_1');
    const victim = await walletsFor('liam');
    const attacker = await walletsFor('mallory');
    await request(app.getHttpServer())
      .post('/issuances')
      .set({ ...as('mallory', ['wallets:read:any']), 'idempotency-key': 'issue-mallory-1' })
      .send({ fiatWalletId: attacker.fiatId, usdxWalletId: victim.usdxId, amount: '1.00' })
      .expect(403)
      .expect((res) => expect(res.body.code).toBe('FORBIDDEN'));
  });

  it('GET /transfers/:id reports progress and links the mint to the explorer once it has a hash', async () => {
    kyc.setTier('nina', 'TIER_1');
    const { fiatId, usdxId } = await walletsFor('nina');
    const accepted = await request(app.getHttpServer())
      .post('/issuances')
      .set({ ...as('nina'), 'idempotency-key': 'issue-nina-1' })
      .send({ fiatWalletId: fiatId, usdxWalletId: usdxId, amount: '250.00' })
      .expect(202);
    const id = accepted.body.correlationId;

    const pending = await request(app.getHttpServer()).get(`/transfers/${id}`).set(as('nina')).expect(200);
    expect(pending.body.status).toBe('PENDING');
    expect(pending.body.terminal).toBe(false);
    expect(pending.body.destTxUrl).toBeNull();
    expect(pending.body.amount.amount).toBe('250.000000');

    const hash = '0x' + 'ab'.repeat(32);
    coreLedger.advanceSaga(id, { status: 'COMPLETED', dest_tx_hash: hash });
    const done = await request(app.getHttpServer()).get(`/transfers/${id}`).set(as('nina')).expect(200);
    expect(done.body.terminal).toBe(true);
    expect(done.body.destTxUrl).toBe(`https://sepolia.etherscan.io/tx/${hash}`);
    expect(done.body.sourceTxUrl).toBeNull();
  });

  it("GET /transfers/:id hides another user's transfer unless the caller holds transactions:read:any", async () => {
    kyc.setTier('oscar', 'TIER_1');
    const { fiatId, usdxId } = await walletsFor('oscar');
    const accepted = await request(app.getHttpServer())
      .post('/issuances')
      .set({ ...as('oscar'), 'idempotency-key': 'issue-oscar-1' })
      .send({ fiatWalletId: fiatId, usdxWalletId: usdxId, amount: '5.00' })
      .expect(202);

    await request(app.getHttpServer())
      .get(`/transfers/${accepted.body.correlationId}`)
      .set(as('peggy'))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/transfers/${accepted.body.correlationId}`)
      .set(as('auditor', ['transactions:read:any']))
      .expect(200);
  });

  it('POST /redemptions enqueues a burn whose hash links on the source chain', async () => {
    kyc.setTier('quinn', 'TIER_1');
    const { fiatId, usdxId } = await walletsFor('quinn');
    const accepted = await request(app.getHttpServer())
      .post('/redemptions')
      .set({ ...as('quinn'), 'idempotency-key': 'redeem-quinn-1' })
      .send({ usdxWalletId: usdxId, fiatWalletId: fiatId, amount: '100.00' })
      .expect(202);
    expect(accepted.body.sagaStatus).toBe('PENDING');

    const hash = '0x' + 'cd'.repeat(32);
    coreLedger.advanceSaga(accepted.body.correlationId, { status: 'COMPLETED', source_tx_hash: hash });
    const done = await request(app.getHttpServer())
      .get(`/transfers/${accepted.body.correlationId}`)
      .set(as('quinn'))
      .expect(200);
    expect(done.body.kind).toBe('REDEEM');
    expect(done.body.sourceTxUrl).toBe(`https://sepolia.etherscan.io/tx/${hash}`);
  });

  describe('issuance/redemption — KYC gate (H5)', () => {
    it('refuses an unverified party on POST /issuances with 403 KYC_REQUIRED, before any core-ledger call', async () => {
      // 'unverified' has no tier row -> TIER_0 in the fake kyc, and the gate
      // runs before the ownership read, so even another user's wallet ids
      // answer KYC_REQUIRED rather than leaking the ownership check's result.
      const before = coreLedger.writes.length;
      await request(app.getHttpServer())
        .post('/issuances')
        .set({ ...as('unverified', ['issuance:create']), 'idempotency-key': 'issue-unverified-1' })
        .send({ fiatWalletId: 'not-mine', usdxWalletId: 'not-mine', amount: '1.00' })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('KYC_REQUIRED'));
      expect(coreLedger.writes).toHaveLength(before);
    });

    it('refuses an unverified party on POST /redemptions with 403 KYC_REQUIRED', async () => {
      const before = coreLedger.writes.length;
      await request(app.getHttpServer())
        .post('/redemptions')
        .set({ ...as('unverified', ['issuance:create']), 'idempotency-key': 'redeem-unverified-1' })
        .send({ usdxWalletId: 'not-mine', fiatWalletId: 'not-mine', amount: '1.00' })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('KYC_REQUIRED'));
      expect(coreLedger.writes).toHaveLength(before);
    });

    it('fails closed with 503 KYC_UNAVAILABLE when kyc is unreachable', async () => {
      kyc.setTier('unverified', 'TIER_1'); // even a verified party is stopped
      const before = coreLedger.writes.length;
      kyc.down = true;
      try {
        await request(app.getHttpServer())
          .post('/issuances')
          .set({ ...as('unverified', ['issuance:create']), 'idempotency-key': 'issue-down-1' })
          .send({ fiatWalletId: 'w1', usdxWalletId: 'w2', amount: '1.00' })
          .expect(503)
          .expect((res) => expect(res.body.code).toBe('KYC_UNAVAILABLE'));
      } finally {
        kyc.down = false;
      }
      expect(coreLedger.writes).toHaveLength(before);
    });
  });
});
