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

describe('operations proxies (rms + core-ledger operator routes)', () => {
  const rms = new RecordingUpstream('rms');
  const coreLedger = new RecordingUpstream('core-ledger');
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.RMS_URL = await rms.listen();
    app = await bootstrapBffApp(await coreLedger.listen());
  });

  afterAll(async () => {
    delete process.env.RMS_URL;
    await app.close();
    await rms.close();
    await coreLedger.close();
  });

  const staff = { 'x-user-id': 'treasurer-1', 'x-permissions': 'reserves:read,reserves:manage,ledger:read,ledger:admin' };

  it.each([
    ['get', '/reserves/status', 'rms'],
    ['get', '/reserves/targets', 'rms'],
    ['put', '/reserves/targets/USD', 'rms'],
    ['get', '/custodians', 'rms'],
    ['get', '/custodians/cust-1/statements?limit=5', 'rms'],
    ['post', '/custodians/cust-1/poll', 'rms'],
    ['post', '/custodians/cust-1/drift', 'rms'],
    ['get', '/attestations', 'rms'],
    ['get', '/attestations/att-1', 'rms'],
    ['post', '/attestations', 'rms'],
    ['post', '/attestations/att-1/publish', 'rms'],
    ['get', '/exposure', 'rms'],
    ['get', '/exposure/limits/BTC', 'rms'],
    ['put', '/exposure/limits/BTC', 'rms'],
    ['get', '/treasury/rebalances?limit=5', 'rms'],
    ['post', '/treasury/rebalances', 'rms'],
    ['get', '/reserves/reconciliation-runs', 'core-ledger'],
    ['get', '/reserves/reconciliation-runs/run-1', 'core-ledger'],
    ['get', '/reserves/reconciliation-breaks?status=OPEN', 'core-ledger'],
    ['get', '/accounts', 'core-ledger'],
    ['get', '/accounts/1000/balance', 'core-ledger'],
    ['get', '/ledger/trial-balance', 'core-ledger'],
    ['get', '/ledger/integrity', 'core-ledger'],
    ['post', '/ledger/closures', 'core-ledger'],
    ['post', '/transactions/tx-1/reversal', 'core-ledger'],
    ['post', '/redemptions/tx-1/confirm', 'core-ledger'],
    ['get', '/redemptions/tx-1/break-glass', 'core-ledger'],
  ] as const)('%s %s reaches %s with the path and caller intact', async (method, path, upstream) => {
    const target = upstream === 'rms' ? rms : coreLedger;
    const before = target.seen.length;

    const res = await request(app.getHttpServer())[method](path).set(staff).send(method === 'get' ? undefined : { reason: 'test' }).expect(200);

    expect(res.body.upstream).toBe(upstream);
    const hit = target.seen[before];
    expect(hit.method).toBe(method.toUpperCase());
    expect(hit.path).toBe(path);
    expect(hit.userId).toBe('treasurer-1');
    if (method !== 'get') expect(JSON.parse(hit.body)).toEqual({ reason: 'test' });
  });

  it('does not forward an rms path that is not on the route table', async () => {
    const before = rms.seen.length;
    await request(app.getHttpServer()).delete('/custodians/cust-1').set(staff).expect(404);
    await request(app.getHttpServer()).post('/reserves/chain-supply-snapshots').set(staff).send({}).expect(404);
    expect(rms.seen.length).toBe(before);
  });
});

describe('operations proxies without RMS_URL', () => {
  let app: NestExpressApplication;
  const coreLedger = new RecordingUpstream('core-ledger');

  beforeAll(async () => {
    delete process.env.RMS_URL;
    app = await bootstrapBffApp(await coreLedger.listen());
  });

  afterAll(async () => {
    await app.close();
    await coreLedger.close();
  });

  it('answers 503 with a readable reason', async () => {
    await request(app.getHttpServer())
      .get('/reserves/status')
      .set({ 'x-user-id': 'treasurer-1' })
      .expect(503)
      .expect((res) => expect(res.body.code).toBe('UPSTREAM_NOT_CONFIGURED'));
  });
});
