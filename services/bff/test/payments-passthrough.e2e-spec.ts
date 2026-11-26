import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { bootstrapBffApp } from './fixtures/bootstrap';

/** An upstream that records method, path, the identity header, the body,
 * and the Idempotency-Key header — the exact passthrough surface this
 * spec's contract cares about. */
class RecordingPayments {
  readonly seen: Array<{ method: string; path: string; userId?: string; idempotencyKey?: string; body: string }> = [];
  private readonly server: Server;

  constructor() {
    this.server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        this.seen.push({
          method: req.method ?? '',
          path: req.url ?? '',
          userId: req.headers['x-user-id'] as string | undefined,
          idempotencyKey: req.headers['idempotency-key'] as string | undefined,
          body: Buffer.concat(chunks).toString('utf8'),
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ upstream: 'payments' }));
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
 * B11's verification: the payments proxy is a passthrough. The cross-asset
 * fields a payment intent carries (slice 4a's sourceWalletId/quoteId/
 * sourceAmount) must reach services/payments byte-for-byte, along with the
 * caller's Idempotency-Key — bff must neither drop nor reshape either.
 */
describe('payments proxy passthrough (e2e)', () => {
  const payments = new RecordingPayments();
  let app: NestExpressApplication;

  beforeAll(async () => {
    const paymentsUrl = await payments.listen();
    process.env.PAYMENTS_URL = paymentsUrl;
    app = await bootstrapBffApp(paymentsUrl);
  });

  afterAll(async () => {
    delete process.env.PAYMENTS_URL;
    await app.close();
    await payments.close();
  });

  const as = (userId: string) => ({ 'x-user-id': userId });

  it('forwards sourceWalletId, sourceAmount and quoteId untouched on POST /payment-intents', async () => {
    const before = payments.seen.length;
    const body = {
      direction: 'TRANSFER',
      amount: '25.00',
      currency: 'USD',
      sourceWalletId: 'wallet-eth-1',
      sourceAmount: '0.00025',
      quoteId: 'q-1',
      beneficiaryId: 'ben-1',
    };

    const res = await request(app.getHttpServer())
      .post('/payment-intents')
      .set({ ...as('payer-1'), 'idempotency-key': 'intent-key-1' })
      .send(body)
      .expect(200);
    expect(res.body.upstream).toBe('payments');

    const hit = payments.seen[before];
    expect(hit.method).toBe('POST');
    expect(hit.path).toBe('/payment-intents');
    expect(JSON.parse(hit.body)).toEqual(body);
    expect(hit.userId).toBe('payer-1');
    expect(hit.idempotencyKey).toBe('intent-key-1');
  });
});
