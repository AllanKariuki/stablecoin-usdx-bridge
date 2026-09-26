import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';

/**
 * A minimal, in-memory stand-in for core-ledger's real HTTP API — just
 * enough of POST /wallets for identity's specs to exercise
 * CoreLedgerClient.ensureDefaultWallet for real (see bff's own
 * FakeCoreLedger, services/bff/test/fixtures/fake-core-ledger.ts, for the
 * fuller sibling this is a deliberately smaller subset of — identity calls
 * exactly one core-ledger route).
 */
export class FakeCoreLedger {
  private server: Server;
  readonly walletRequests: Array<{ user_id: string; currency: string }> = [];

  constructor() {
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  async listen(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => this.server.close((err) => (err ? reject(err) : resolve())));
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://internal');
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const body = rawBody ? JSON.parse(rawBody) : {};

      if (req.method === 'POST' && url.pathname === '/wallets') {
        this.walletRequests.push({ user_id: body.user_id, currency: body.currency });
        return this.json(res, 201, {
          id: 'wallet-1',
          user_id: body.user_id,
          currency: body.currency,
          chain: '',
          address: '',
          status: 'ACTIVE',
          label: body.label ?? 'Main',
          balance: '0.00',
        });
      }

      this.json(res, 404, { error: 'no route', code: 'NOT_FOUND' });
    });
  }

  private json(res: http.ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
  }
}
