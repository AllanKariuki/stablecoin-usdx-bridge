import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { FakeCoreLedger } from './fixtures/fake-core-ledger';
import { FakeKyc } from './fixtures/fake-kyc';
import { bootstrapBffApp } from './fixtures/bootstrap';

const ETH_ADDRESS = '0x4e29A6a3689F37db9a93985A0f6424420cc2CD49';
const SOL_ADDRESS = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

/**
 * The money-movement routes against the fake core-ledger. What matters on
 * these tests is not the happy path alone but that a rejected request never
 * reaches core-ledger — a 403 that still posted a journal entry would be
 * worse than no check at all. H5 adds the KYC gate to that contract: a
 * party below TIER_1 is refused before any core-ledger call, while the
 * operator-only /deposits and /withdrawals stay ungated (an operator
 * adjusts any wallet by design).
 */
describe('bff money movement and bridges (e2e, against a fake core-ledger)', () => {
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

  async function fiatWallet(userId: string): Promise<string> {
    const res = await request(app.getHttpServer()).get('/wallets').set(as(userId)).expect(200);
    return res.body[0].id;
  }

  async function usdxWallet(userId: string, chain: 'ETHEREUM' | 'SOLANA', address: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/wallets/usdx')
      .set(as(userId))
      .send({ chain, address })
      .expect(201);
    return res.body.id;
  }

  const writesBefore = () => coreLedger.writes.length;

  describe('POST /deposits (operator-only manual adjustment)', () => {
    it('refuses a customer holding only wallets:write:own, without calling core-ledger', async () => {
      const walletId = await fiatWallet('dep-customer');
      const before = writesBefore();

      await request(app.getHttpServer())
        .post('/deposits')
        .set({ ...as('dep-customer', ['wallets:write:own']), 'idempotency-key': 'dep-customer-1' })
        .send({ walletId, amount: '1000.00' })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS'));

      expect(coreLedger.writes).toHaveLength(before);
    });

    it('lets a treasury operator credit any wallet and forwards them as the actor', async () => {
      const walletId = await fiatWallet('dep-victim');
      const before = writesBefore();

      await request(app.getHttpServer())
        .post('/deposits')
        .set({ ...as('treasury-1', ['wallets:adjust:manual']), 'idempotency-key': 'dep-treasury-1' })
        .send({ walletId, amount: '10.00', reference: 'adjustment' })
        .expect(201);

      expect(coreLedger.writes).toHaveLength(before + 1);
      expect(coreLedger.lastActor).toBe('treasury-1');
    });
  });

  describe('POST /withdrawals (operator-only manual adjustment)', () => {
    it('refuses a customer holding only wallets:write:own, without calling core-ledger', async () => {
      const walletId = await fiatWallet('wd-customer');
      const before = writesBefore();

      await request(app.getHttpServer())
        .post('/withdrawals')
        .set({ ...as('wd-customer', ['wallets:write:own']), 'idempotency-key': 'wd-customer-1' })
        .send({ walletId, amount: '1.00' })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS'));

      expect(coreLedger.writes).toHaveLength(before);
    });

    it("lets a treasury operator debit another user's wallet and forwards them as the actor", async () => {
      const walletId = await fiatWallet('wd-victim');
      const before = writesBefore();

      await request(app.getHttpServer())
        .post('/withdrawals')
        .set({ ...as('treasury-1', ['wallets:adjust:manual']), 'idempotency-key': 'wd-treasury-1' })
        .send({ walletId, amount: '5.00', reference: 'adjustment' })
        .expect(201);

      expect(coreLedger.writes).toHaveLength(before + 1);
      expect(coreLedger.lastActor).toBe('treasury-1');
    });
  });

  describe('POST /transfers', () => {
    it("refuses to move money out of another user's wallet, without calling core-ledger", async () => {
      // At the minimum tier, so the refusal asserted here is the ownership
      // check — the KYC gate passes and never gets in the way of proving it.
      kyc.setTier('tr-attacker', 'TIER_1');
      const victim = await fiatWallet('tr-victim');
      const attacker = await fiatWallet('tr-attacker');
      const before = writesBefore();

      await request(app.getHttpServer())
        .post('/transfers')
        .set({ ...as('tr-attacker', ['wallets:write:own']), 'idempotency-key': 'tr-attacker-1' })
        .send({ fromWalletId: victim, toWalletId: attacker, amount: '1.00' })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('FORBIDDEN'));

      expect(coreLedger.writes).toHaveLength(before);
    });

    it("allows a transfer to another user's wallet (the destination is not ownership-checked) and forwards the actor", async () => {
      kyc.setTier('tr-sender', 'TIER_1');
      const mine = await fiatWallet('tr-sender');
      const theirs = await fiatWallet('tr-receiver');
      const before = writesBefore();

      await request(app.getHttpServer())
        .post('/transfers')
        .set({ ...as('tr-sender', ['wallets:write:own']), 'idempotency-key': 'tr-sender-1' })
        .send({ fromWalletId: mine, toWalletId: theirs, amount: '2.00' })
        .expect(201);

      expect(coreLedger.writes).toHaveLength(before + 1);
      expect(coreLedger.lastActor).toBe('tr-sender');
    });
  });

  describe('POST /transfers — KYC gate (H5)', () => {
    it("refuses a party below TIER_1 with 403 KYC_REQUIRED before any core-ledger call", async () => {
      // The fake kyc answers TIER_0 for parties nobody has screened — which
      // is the real product's behaviour for a fresh party, no setup needed.
      const unverified = await fiatWallet('kyc-unverified');
      const theirs = await fiatWallet('kyc-receiver');
      const before = writesBefore();

      await request(app.getHttpServer())
        .post('/transfers')
        .set({ ...as('kyc-unverified', ['wallets:write:own']), 'idempotency-key': 'kyc-unverified-1' }) // gitleaks:allow (test idempotency key, not a secret)
        .send({ fromWalletId: unverified, toWalletId: theirs, amount: '1.00' })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('KYC_REQUIRED'));

      expect(coreLedger.writes).toHaveLength(before);
    });

    it('fails closed with 503 KYC_UNAVAILABLE when kyc is unreachable', async () => {
      const mine = await fiatWallet('kyc-down-sender');
      const theirs = await fiatWallet('kyc-down-receiver');
      const before = writesBefore();
      kyc.down = true;
      try {
        await request(app.getHttpServer())
          .post('/transfers')
          .set({ ...as('kyc-down-sender', ['wallets:write:own']), 'idempotency-key': 'kyc-down-1' })
          .send({ fromWalletId: mine, toWalletId: theirs, amount: '1.00' })
          .expect(503)
          .expect((res) => expect(res.body.code).toBe('KYC_UNAVAILABLE'));
      } finally {
        kyc.down = false;
      }
      expect(coreLedger.writes).toHaveLength(before);
    });

    it('operator /deposits stays ungated even while kyc is down: an operator adjusts any wallet', async () => {
      const victim = await fiatWallet('kyc-down-victim'); // TIER_0 in the fake kyc
      const before = writesBefore();
      kyc.down = true;
      try {
        await request(app.getHttpServer())
          .post('/deposits')
          .set({ ...as('treasury-kyc', ['wallets:adjust:manual']), 'idempotency-key': 'kyc-down-dep-1' })
          .send({ walletId: victim, amount: '1.00' })
          .expect(201);
      } finally {
        kyc.down = false;
      }
      expect(coreLedger.writes).toHaveLength(before + 1);
    });
  });

  describe('POST /bridges', () => {
    it('starts a bridge between the caller\'s own wallets and answers 202 with the saga handle', async () => {
      kyc.setTier('bridger', 'TIER_1');
      const from = await usdxWallet('bridger', 'ETHEREUM', ETH_ADDRESS);
      const to = await usdxWallet('bridger', 'SOLANA', SOL_ADDRESS);

      const res = await request(app.getHttpServer())
        .post('/bridges')
        .set({ ...as('bridger', ['bridge:create']), 'idempotency-key': 'bridge-1' })
        .send({ fromWalletId: from, toWalletId: to, amount: '25.00' })
        .expect(202);

      expect(res.body.correlationId).toBe('corr-bridge-1');
      expect(res.body.sagaStatus).toBe('PENDING');
      expect(res.body.kind).toBe('BRIDGE');
      expect(coreLedger.lastActor).toBe('bridger');
    });

    it("refuses to bridge out of, or into, another user's wallet", async () => {
      // At the minimum tier so the refusal is the ownership check, not the gate.
      kyc.setTier('bridge-attacker', 'TIER_1');
      const mine = await usdxWallet('bridge-attacker', 'ETHEREUM', ETH_ADDRESS);
      const victim = await usdxWallet('bridge-victim', 'SOLANA', SOL_ADDRESS);
      const before = writesBefore();

      await request(app.getHttpServer())
        .post('/bridges')
        .set({ ...as('bridge-attacker', ['bridge:create']), 'idempotency-key': 'bridge-attacker-1' })
        .send({ fromWalletId: mine, toWalletId: victim, amount: '1.00' })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('FORBIDDEN'));

      expect(coreLedger.writes).toHaveLength(before);
    });

    it('refuses an unverified party with 403 KYC_REQUIRED before any core-ledger call', async () => {
      // bridge-unverified has no tier row -> TIER_0 in the fake kyc.
      const before = writesBefore();
      await request(app.getHttpServer())
        .post('/bridges')
        .set({ ...as('bridge-unverified', ['bridge:create']), 'idempotency-key': 'bridge-kyc-1' })
        .send({ fromWalletId: 'not-mine', toWalletId: 'not-theirs', amount: '1.00' })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('KYC_REQUIRED'));

      expect(coreLedger.writes).toHaveLength(before);
    });

    it('requires an Idempotency-Key', async () => {
      await request(app.getHttpServer())
        .post('/bridges')
        .set(as('bridger', ['bridge:create']))
        .send({ fromWalletId: 'w1', toWalletId: 'w2', amount: '1.00' })
        .expect(400)
        .expect((res) => expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY'));
    });
  });
});
