import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { FakeCoreLedger } from './fixtures/fake-core-ledger';
import { FakeKyc } from './fixtures/fake-kyc';
import { bootstrapBffApp } from './fixtures/bootstrap';

const ETH_ADDRESS = '0x4e29A6a3689F37db9a93985A0f6424420cc2CD49';

/**
 * A stand-in for services/pricing's POST /quotes: records exactly what bff
 * sent and answers with a canned QuoteResponse the assertions pass
 * through. bff must be the one deriving currencies and pinning party_id —
 * that is the whole point of these tests.
 */
class FakePricing {
  calls: Array<Record<string, unknown>> = [];
  private readonly server: Server;

  constructor() {
    this.server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
        this.calls.push(body);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            quote_id: 'q-1',
            from: body.from,
            to: body.to,
            amount_side: body.amount_side ?? 'FROM',
            amount: body.amount,
            rate: '100000',
            spread_bps: 100,
            gross: '1.00',
            fee: '0.01',
            net: '0.99',
            expires_at: new Date(Date.now() + 30000).toISOString(),
            sources: ['stub'],
          }),
        );
      });
    });
  }

  async listen(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => this.server.close((err) => (err ? reject(err) : resolve())));
  }
}

/**
 * The portal money API (slice 4b): currencies, wallet create/patch,
 * quotes, conversions and the conversion history — against the fake
 * core-ledger and a recording fake pricing. What matters on every write is
 * the same contract as the other money-movement specs: the caller is only
 * ever the auth context, every wallet is ownership-checked, and a refused
 * request never reaches the service that would have executed it.
 */
describe('bff portal money api (e2e)', () => {
  let coreLedger: FakeCoreLedger;
  let kyc: FakeKyc;
  let pricing: FakePricing;
  let app: NestExpressApplication;

  beforeAll(async () => {
    coreLedger = new FakeCoreLedger();
    const coreLedgerUrl = await coreLedger.listen();
    kyc = new FakeKyc();
    const kycUrl = await kyc.listen();
    pricing = new FakePricing();
    process.env.PRICING_URL = await pricing.listen();
    app = await bootstrapBffApp(coreLedgerUrl, kycUrl);
  });

  afterAll(async () => {
    delete process.env.PRICING_URL;
    await app.close();
    await coreLedger.close();
    await kyc.close();
    await pricing.close();
  });

  const as = (userId: string, permissions: string[] = []) => ({
    'x-user-id': userId,
    'x-permissions': permissions.join(','),
  });

  async function usdWallet(userId: string): Promise<string> {
    const res = await request(app.getHttpServer()).get('/wallets').set(as(userId)).expect(200);
    const usd = res.body.find((w: { currency: string }) => w.currency === 'USD');
    return usd.id;
  }

  async function walletIn(userId: string, currency: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/wallets').set(as(userId)).send({ currency }).expect(201);
    return res.body.id;
  }

  async function usdxWallet(userId: string, chain: 'ETHEREUM' | 'SOLANA'): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/wallets/usdx')
      .set(as(userId))
      .send({ chain, address: chain === 'ETHEREUM' ? ETH_ADDRESS : undefined })
      .expect(201);
    return res.body.id;
  }

  describe('GET /currencies', () => {
    it('lists the supported set in camelCase with the derived native chain', async () => {
      const res = await request(app.getHttpServer()).get('/currencies').set(as('cur-user')).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const btc = res.body.find((c: { code: string }) => c.code === 'BTC');
      expect(btc).toMatchObject({ code: 'BTC', kind: 'CRYPTO', decimals: 8, nativeChain: 'BITCOIN' });
      // snake_case never leaks through bff
      expect(btc.native_chain).toBeUndefined();
      const usdx = res.body.find((c: { code: string }) => c.code === 'USDX');
      expect(usdx.nativeChain).toBe('');
    });
  });

  describe('POST /wallets', () => {
    it("creates the caller's wallet, stamping the native chain for crypto", async () => {
      const res = await request(app.getHttpServer())
        .post('/wallets')
        .set(as('w-btc'))
        .send({ currency: 'btc', label: 'Stack' })
        .expect(201);

      expect(res.body).toMatchObject({ userId: 'w-btc', currency: 'BTC', chain: 'BITCOIN', label: 'Stack' });
      expect(res.body.isDefault).toBe(false);

      // Idempotent: the same (user, currency) returns the same wallet.
      const again = await request(app.getHttpServer()).post('/wallets').set(as('w-btc')).send({ currency: 'BTC' }).expect(201);
      expect(again.body.id).toBe(res.body.id);
    });

    it('refuses USD-X with 422 USE_USDX_ROUTE — it lives on two chains', async () => {
      await request(app.getHttpServer())
        .post('/wallets')
        .set(as('w-usdx'))
        .send({ currency: 'USDX' })
        .expect(422)
        .expect((res) => expect(res.body.code).toBe('USE_USDX_ROUTE'));
    });

    it('refuses a body without a currency', async () => {
      await request(app.getHttpServer()).post('/wallets').set(as('w-none')).send({ label: 'x' }).expect(400);
    });
  });

  describe('PATCH /wallets/:walletId', () => {
    it("updates the caller's own wallet label and default flag", async () => {
      const walletId = await walletIn('p-owner', 'USD');
      const res = await request(app.getHttpServer())
        .patch(`/wallets/${walletId}`)
        .set(as('p-owner'))
        .send({ label: 'Savings', is_default: true })
        .expect(200);
      expect(res.body).toMatchObject({ label: 'Savings', isDefault: true });
    });

    it("refuses to patch another user's wallet", async () => {
      const walletId = await usdWallet('p-victim');
      await request(app.getHttpServer())
        .patch(`/wallets/${walletId}`)
        .set(as('p-attacker'))
        .send({ label: 'mine now' })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('FORBIDDEN'));
    });
  });

  describe('POST /quotes', () => {
    it('prices an FX pair from the wallets, pinning the party to the caller', async () => {
      const from = await walletIn('q-fx', 'BTC');
      const to = await usdWallet('q-fx');

      const res = await request(app.getHttpServer())
        .post('/quotes')
        .set(as('q-fx'))
        .send({ fromWalletId: from, toWalletId: to, amount: '0.01' })
        .expect(201);

      expect(res.body).toMatchObject({ quote_id: 'q-1', route: 'FX', from: 'BTC', to: 'USD' });
      // pricing saw currencies derived from the wallets, never a body field,
      // and the caller as the party the quote is pinned to.
      expect(pricing.calls.at(-1)).toEqual({
        from: 'BTC',
        to: 'USD',
        amount: '0.01',
        party_id: 'q-fx',
        amount_side: undefined,
      });
    });

    it('accepts to_currency instead of a second wallet', async () => {
      const from = await usdWallet('q-ccy');
      await request(app.getHttpServer())
        .post('/quotes')
        .set(as('q-ccy'))
        .send({ fromWalletId: from, toCurrency: 'kes', amount: '100.00', amountSide: 'TO' })
        .expect(201);
      expect(pricing.calls.at(-1)).toEqual({
        from: 'USD',
        to: 'KES',
        amount: '100.00',
        party_id: 'q-ccy',
        amount_side: 'TO',
      });
    });

    it('returns a synthetic 1:1 peg preview for USD<->USD-X, minting nothing', async () => {
      const usd = await usdWallet('q-peg');
      const usdx = await usdxWallet('q-peg', 'ETHEREUM');
      const callsBefore = pricing.calls.length;

      const issue = await request(app.getHttpServer())
        .post('/quotes')
        .set(as('q-peg'))
        .send({ fromWalletId: usd, toWalletId: usdx, amount: '25.00' })
        .expect(201);
      expect(issue.body).toEqual({
        quote_id: null,
        route: 'ISSUANCE',
        from: 'USD',
        to: 'USDX',
        amount: '25.00',
        rate: '1',
        fee: '0',
        net: '25.00',
        expires_at: null,
      });

      const redeem = await request(app.getHttpServer())
        .post('/quotes')
        .set(as('q-peg'))
        .send({ fromWalletId: usdx, toCurrency: 'USD', amount: '25.00' })
        .expect(201);
      expect(redeem.body.route).toBe('REDEMPTION');

      // Neither peg preview ever reached pricing: nothing was minted.
      expect(pricing.calls.length).toBe(callsBefore);
    });

    it('refuses a USD-X pair that is not the peg with USDX_USES_ISSUANCE', async () => {
      const usdx = await usdxWallet('q-cross', 'ETHEREUM');
      const btc = await walletIn('q-cross', 'BTC');
      const callsBefore = pricing.calls.length;

      await request(app.getHttpServer())
        .post('/quotes')
        .set(as('q-cross'))
        .send({ fromWalletId: usdx, toWalletId: btc, amount: '1.00' })
        .expect(422)
        .expect((res) => expect(res.body.code).toBe('USDX_USES_ISSUANCE'));

      expect(pricing.calls.length).toBe(callsBefore);
    });

    it("refuses to quote against another user's wallet", async () => {
      const victim = await usdWallet('q-victim');
      const mine = await walletIn('q-attacker', 'BTC');
      const callsBefore = pricing.calls.length;

      await request(app.getHttpServer())
        .post('/quotes')
        .set(as('q-attacker'))
        .send({ fromWalletId: victim, toWalletId: mine, amount: '0.01' })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('FORBIDDEN'));

      expect(pricing.calls.length).toBe(callsBefore);
    });
  });

  describe('POST /conversions', () => {
    it('requires an Idempotency-Key', async () => {
      await request(app.getHttpServer())
        .post('/conversions')
        .set(as('c-nokey'))
        .send({ fromWalletId: 'w1', toWalletId: 'w2', amount: '1.00' })
        .expect(400)
        .expect((res) => expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY'));
    });

    it('refuses a party below TIER_1 with 403 KYC_REQUIRED before any core-ledger call', async () => {
      // c-unverified has no tier row -> TIER_0 in the fake kyc.
      const before = coreLedger.writes.length;
      await request(app.getHttpServer())
        .post('/conversions')
        .set({ ...as('c-unverified'), 'idempotency-key': 'c-kyc-1' })
        .send({ fromWalletId: 'w1', toWalletId: 'w2', amount: '1.00' })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('KYC_REQUIRED'));
      expect(coreLedger.writes).toHaveLength(before);
    });

    it('books an FX conversion and answers 201 with the ledger transaction', async () => {
      kyc.setTier('c-fx', 'TIER_1');
      const from = await walletIn('c-fx', 'USD');
      const to = await walletIn('c-fx', 'KES');
      const before = coreLedger.writes.length;

      const res = await request(app.getHttpServer())
        .post('/conversions')
        .set({ ...as('c-fx'), 'idempotency-key': 'c-fx-1' })
        .send({ fromWalletId: from, toWalletId: to, amount: '10.00', quoteId: 'q-1' })
        .expect(201);

      expect(res.body).toMatchObject({ route: 'FX', correlationId: null, sagaStatus: null, status: 'POSTED' });
      expect(res.body.transaction.type).toBe('FX_CONVERSION');
      expect(coreLedger.writes).toHaveLength(before + 1);
      expect(coreLedger.lastActor).toBe('c-fx');
    });

    it('routes USD->USD-X through issuance, answering 202 with the saga handle', async () => {
      kyc.setTier('c-issue', 'TIER_1');
      const usd = await usdWallet('c-issue');
      const usdx = await usdxWallet('c-issue', 'ETHEREUM');

      const res = await request(app.getHttpServer())
        .post('/conversions')
        .set({ ...as('c-issue'), 'idempotency-key': 'c-issue-1' })
        .send({ fromWalletId: usd, toWalletId: usdx, amount: '25.00' })
        .expect(202);

      expect(res.body).toMatchObject({ route: 'ISSUANCE', sagaStatus: 'PENDING', status: 'PENDING' });
      expect(res.body.correlationId).toBe('corr-c-issue-1');
      expect(res.body.transaction).toBeDefined();
    });

    it('routes USD-X->USD through redemption', async () => {
      kyc.setTier('c-redeem', 'TIER_1');
      const usd = await usdWallet('c-redeem');
      const usdx = await usdxWallet('c-redeem', 'ETHEREUM');

      const res = await request(app.getHttpServer())
        .post('/conversions')
        .set({ ...as('c-redeem'), 'idempotency-key': 'c-redeem-1' })
        .send({ fromWalletId: usdx, toWalletId: usd, amount: '25.00' })
        .expect(202);

      expect(res.body.route).toBe('REDEMPTION');
      expect(res.body.correlationId).toBe('corr-c-redeem-1');
    });

    it('refuses any other USD-X pair with USDX_TWO_STEP', async () => {
      kyc.setTier('c-cross', 'TIER_1');
      const usdx = await usdxWallet('c-cross', 'ETHEREUM');
      const btc = await walletIn('c-cross', 'BTC');
      const before = coreLedger.writes.length;

      await request(app.getHttpServer())
        .post('/conversions')
        .set({ ...as('c-cross'), 'idempotency-key': 'c-cross-1' })
        .send({ fromWalletId: usdx, toWalletId: btc, amount: '1.00' })
        .expect(422)
        .expect((res) => expect(res.body.code).toBe('USDX_TWO_STEP'));

      expect(coreLedger.writes).toHaveLength(before);
    });

    it("refuses to convert out of another user's wallet, without calling core-ledger", async () => {
      kyc.setTier('c-attacker', 'TIER_1');
      const victim = await usdWallet('c-victim');
      const mine = await usdWallet('c-attacker');
      const before = coreLedger.writes.length;

      await request(app.getHttpServer())
        .post('/conversions')
        .set({ ...as('c-attacker'), 'idempotency-key': 'c-attacker-1' })
        .send({ fromWalletId: victim, toWalletId: mine, amount: '1.00' })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('FORBIDDEN'));

      expect(coreLedger.writes).toHaveLength(before);
    });
  });

  describe('GET /conversions', () => {
    it('forwards the type filter to core-ledger and returns only conversion transactions', async () => {
      kyc.setTier('list-user', 'TIER_1');
      const usd = await usdWallet('list-user');
      const kes = await walletIn('list-user', 'KES');

      // A plain deposit and an FX conversion for the same user: only the
      // conversion belongs on this feed, and the filter that excludes the
      // deposit runs in core-ledger's query rather than over a page here.
      await request(app.getHttpServer())
        .post('/deposits')
        .set({ ...as('list-user', ['wallets:adjust:manual']), 'idempotency-key': 'list-dep-1' })
        .send({ walletId: usd, amount: '50.00' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/conversions')
        .set({ ...as('list-user'), 'idempotency-key': 'list-fx-1' })
        .send({ fromWalletId: usd, toWalletId: kes, amount: '10.00', quoteId: 'q-1' })
        .expect(201);

      const res = await request(app.getHttpServer()).get('/conversions').set(as('list-user')).expect(200);
      expect(res.body.transactions).toHaveLength(1);
      expect(res.body.transactions[0].type).toBe('FX_CONVERSION');
      expect(res.body.nextCursor).toBe('');

      // The filter reached core-ledger intact — not a bff-side scan.
      expect(coreLedger.lastTransactionsQuery).toMatchObject({
        userId: 'list-user',
        types: ['FX_CONVERSION', 'USDX_ISSUE', 'USDX_REDEEM'],
      });
    });

    it('passes the cursor through untouched', async () => {
      await request(app.getHttpServer()).get('/conversions?cursor=abc').set(as('list-user')).expect(200);
      expect(coreLedger.lastTransactionsQuery?.cursor).toBe('abc');
    });
  });
});
