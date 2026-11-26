import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';

const TIERS = [
  { name: 'TIER_0', rank: 0 },
  { name: 'TIER_1', rank: 1 },
  { name: 'TIER_2', rank: 2 },
];

/**
 * A minimal stand-in for kyc's GET /internal/parties/:partyId/tier — the
 * endpoint KycGate calls. Parties default to TIER_0 (rank 0), exactly like
 * the real service: a party nobody has screened can move nothing. `down`
 * makes the server stop answering, so specs can assert the fail-closed
 * 503 KYC_UNAVAILABLE path over a real dead connection.
 */
export class FakeKyc {
  private server: Server;
  private partyTiers = new Map<string, { name: string; rank: number }>();
  /** The Authorization header kyc last saw — bff's service-account bearer. */
  lastAuth = '';
  down = false;

  setTier(partyId: string, name: string): void {
    const tier = TIERS.find((t) => t.name === name);
    if (!tier) throw new Error(`no fake tier ${name}`);
    this.partyTiers.set(partyId, tier);
  }

  async listen(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    // unref() stops the listener from keeping jest's process alive after the
    // suites finish — the same trick FakeKeycloak (same directory) needs, and
    // for the same reason.
    this.server.unref();
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async close(): Promise<void> {
    // KycGate's fetch keeps a keep-alive connection to this server in its
    // pool; without severing it, close() waits for the pool's idle timeout
    // and jest hangs with an open handle (the same reason FakeIssuer in
    // @damp/nest-platform destroys sockets before closing).
    this.server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => this.server.close((err) => (err ? reject(err) : resolve())));
  }

  constructor() {
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.lastAuth = String(req.headers.authorization ?? '');
    if (this.down) {
      res.destroy();
      return;
    }
    const match = (req.url ?? '').match(/^\/internal\/parties\/([^/]+)\/tier$/);
    if (req.method === 'GET' && match) {
      const partyId = decodeURIComponent(match[1]);
      const tier = this.partyTiers.get(partyId) ?? TIERS[0];
      return this.json(res, 200, {
        partyId,
        tier: { name: tier.name, rank: tier.rank },
        status: null,
        tiers: TIERS,
      });
    }
    this.json(res, 404, { error: 'no route', code: 'NOT_FOUND' });
  }

  private json(res: http.ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
  }
}
