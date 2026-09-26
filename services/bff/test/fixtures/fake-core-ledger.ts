import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';

/**
 * A minimal, in-memory stand-in for core-ledger's real HTTP API — enough of
 * its actual response shapes (snake_case, decimal-string amounts) for bff's
 * e2e specs to exercise CoreLedgerClient and every translation layer for
 * real, over a real HTTP connection, rather than mocking fetch() and
 * risking the test drifting from what a real response looks like.
 */
export class FakeCoreLedger {
  private server: Server;
  private wallets = new Map<string, { id: string; user_id: string; currency: string; balance: string }>();
  private transactions: Array<{ id: string; user_id: string; created_at: string; amount: string }> = [];
  private nextId = 1;

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
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const body = rawBody ? JSON.parse(rawBody) : {};
      try {
        this.route(req, res, body);
      } catch (err) {
        this.json(res, 500, { error: err instanceof Error ? err.message : String(err), code: 'INTERNAL' });
      }
    });
  }

  private route(req: http.IncomingMessage, res: http.ServerResponse, body: Record<string, unknown>): void {
    const url = new URL(req.url ?? '/', 'http://internal');
    const method = req.method ?? 'GET';

    if (method === 'GET' && url.pathname === '/healthz') {
      return this.json(res, 200, { status: 'ok' });
    }

    if (method === 'POST' && url.pathname === '/wallets') {
      const userId = String(body.user_id);
      const currency = String(body.currency ?? 'USD');
      const existing = [...this.wallets.values()].find((w) => w.user_id === userId && w.currency === currency);
      if (existing) return this.json(res, 201, this.renderWallet(existing));
      const wallet = { id: `wallet-${this.nextId++}`, user_id: userId, currency, balance: '0.00' };
      this.wallets.set(wallet.id, wallet);
      return this.json(res, 201, this.renderWallet(wallet));
    }

    const usersWalletsMatch = url.pathname.match(/^\/users\/([^/]+)\/wallets$/);
    if (method === 'GET' && usersWalletsMatch) {
      const userId = decodeURIComponent(usersWalletsMatch[1]);
      const wallets = [...this.wallets.values()].filter((w) => w.user_id === userId).map((w) => this.renderWallet(w));
      return this.json(res, 200, { wallets });
    }

    const walletMatch = url.pathname.match(/^\/wallets\/([^/]+)$/);
    if (method === 'GET' && walletMatch) {
      const wallet = this.wallets.get(decodeURIComponent(walletMatch[1]));
      if (!wallet) return this.json(res, 404, { error: 'not found', code: 'UNKNOWN_WALLET' });
      return this.json(res, 200, this.renderWallet(wallet));
    }

    const statementMatch = url.pathname.match(/^\/wallets\/([^/]+)\/statement$/);
    if (method === 'GET' && statementMatch) {
      const walletId = decodeURIComponent(statementMatch[1]);
      const wallet = this.wallets.get(walletId);
      if (!wallet) return this.json(res, 404, { error: 'not found', code: 'UNKNOWN_WALLET' });
      return this.json(res, 200, {
        wallet_id: walletId,
        currency: wallet.currency,
        entries: [
          {
            seq: 1,
            transaction_id: 'tx-1',
            direction: 'CREDIT',
            amount: '50.00',
            running_balance: wallet.balance,
            currency: wallet.currency,
            value_date: '2026-01-01',
            description: 'test entry',
          },
        ],
      });
    }

    if (method === 'POST' && (url.pathname === '/deposits' || url.pathname === '/transfers')) {
      const walletId = String(body.wallet_id ?? body.from_wallet_id);
      const wallet = this.wallets.get(walletId);
      if (!wallet) return this.json(res, 404, { error: 'no such wallet', code: 'UNKNOWN_WALLET' });
      const tx = {
        id: `tx-${this.nextId++}`,
        user_id: wallet.user_id,
        created_at: new Date().toISOString(),
        amount: String(body.amount),
      };
      this.transactions.push(tx);
      return this.json(res, 201, this.renderTransaction(tx, wallet.currency));
    }

    if (method === 'GET' && url.pathname === '/transactions') {
      const userId = url.searchParams.get('user_id') ?? '';
      const limit = Number(url.searchParams.get('limit') ?? '50');
      const matched = this.transactions.filter((t) => t.user_id === userId).slice(0, limit);
      return this.json(res, 200, {
        transactions: matched.map((t) => this.renderTransaction(t, 'USD')),
        next_cursor: '',
      });
    }

    this.json(res, 404, { error: 'no route', code: 'NOT_FOUND' });
  }

  private renderWallet(w: { id: string; user_id: string; currency: string; balance: string }) {
    return {
      id: w.id,
      user_id: w.user_id,
      currency: w.currency,
      chain: '',
      address: '',
      status: 'ACTIVE',
      label: 'Main',
      balance: w.balance,
    };
  }

  private renderTransaction(t: { id: string; created_at: string; amount: string }, currency: string) {
    return {
      id: t.id,
      type: 'FIAT_DEPOSIT',
      status: 'POSTED',
      reversed: false,
      value_date: '2026-01-01',
      description: 'test',
      external_ref: '',
      created_at: t.created_at,
      entries: [
        {
          line_no: 1,
          account_id: 'acct-1',
          direction: 'CREDIT',
          currency,
          amount: t.amount,
          running_balance: t.amount,
          description: 'test entry',
        },
      ],
    };
  }

  private json(res: http.ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
  }
}
