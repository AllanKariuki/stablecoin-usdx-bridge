import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { bootstrapBffApp } from './fixtures/bootstrap';

/** An upstream that records what reached it and answers with a marker of which upstream it is. */
class RecordingUpstream {
  readonly seen: Array<{ method: string; path: string; userId?: string; body: string }> = [];
  private readonly server: Server;

  constructor(private readonly name: string) {
    this.server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        this.seen.push({
          method: req.method ?? '',
          path: req.url ?? '',
          userId: req.headers['x-user-id'] as string | undefined,
          body: Buffer.concat(chunks).toString('utf8'),
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ upstream: this.name }));
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

describe('pricing proxy', () => {
  const pricing = new RecordingUpstream('pricing');
  const coreLedger = new RecordingUpstream('core-ledger');
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.PRICING_URL = await pricing.listen();
    app = await bootstrapBffApp(await coreLedger.listen());
  });

  afterAll(async () => {
    delete process.env.PRICING_URL;
    await app.close();
    await pricing.close();
    await coreLedger.close();
  });

  const staff = { 'x-user-id': 'treasurer-1', 'x-permissions': 'reserves:read,reserves:manage' };

  it.each([
    // [request path, upstream path after the /pricing prefix is stripped]
    ['get', '/pricing/pairs', '/pairs'],
    ['get', '/pricing/rates?base=USD', '/rates?base=USD'],
    ['patch', '/pricing/pairs/BTC/USD', '/pairs/BTC/USD'],
  ] as const)('%s %s reaches pricing as %s with the caller intact', async (method, requestPath, upstreamPath) => {
    const before = pricing.seen.length;

    const res = await request(app.getHttpServer())[method](requestPath).set(staff).send(method === 'get' ? undefined : { spread_bps: 25 }).expect(200);

    expect(res.body.upstream).toBe('pricing');
    const hit = pricing.seen[before];
    expect(hit.method).toBe(method.toUpperCase());
    expect(hit.path).toBe(upstreamPath);
    expect(hit.userId).toBe('treasurer-1');
    if (method !== 'get') expect(JSON.parse(hit.body)).toEqual({ spread_bps: 25 });
  });
});

describe('pricing proxy without PRICING_URL', () => {
  let app: NestExpressApplication;
  const coreLedger = new RecordingUpstream('core-ledger');

  beforeAll(async () => {
    delete process.env.PRICING_URL;
    app = await bootstrapBffApp(await coreLedger.listen());
  });

  afterAll(async () => {
    await app.close();
    await coreLedger.close();
  });

  it('answers 503 with a readable reason', async () => {
    await request(app.getHttpServer())
      .get('/pricing/pairs')
      .set({ 'x-user-id': 'treasurer-1' })
      .expect(503)
      .expect((res) => expect(res.body.code).toBe('UPSTREAM_NOT_CONFIGURED'));
  });
});
