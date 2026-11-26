import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';

/** The token the fake issues — deterministic so specs can assert on it. */
export const FAKE_SERVICE_TOKEN = 'test-svc-token';

/**
 * A minimal stand-in for Keycloak's client-credentials token endpoint —
 * enough of the OIDC token shape for @damp/nest-platform's
 * ServiceTokenClient to mint and cache against, so bff's e2e specs exercise
 * the real token plumbing (H2) over a real HTTP connection instead of a
 * stubbed fetch.
 */
export class FakeKeycloak {
  private server: Server;
  grants = 0;
  private static shared: { url: string; grants: () => number; close: () => Promise<void> } | null = null;

  /**
   * The one fake per test process (bootstrapBffApp is called once per spec
   * file, and each spec gets its own process under jest). The process-exit
   * hook closes it, since Nest's app.close() has no hook for unrelated
   * servers.
   */
  static async sharedUrl(): Promise<string> {
    if (!FakeKeycloak.shared) {
      const kc = new FakeKeycloak();
      const url = await kc.listen();
      FakeKeycloak.shared = { url, grants: () => kc.grants, close: () => kc.close() };
      process.once('exit', () => {
        void FakeKeycloak.shared?.close();
      });
    }
    return FakeKeycloak.shared.url;
  }

  /** How many client-credentials grants the fake has served (per process). */
  static sharedGrants(): number {
    return FakeKeycloak.shared?.grants() ?? 0;
  }

  private constructor() {
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  async listen(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    // The shared singleton is deliberately never closed during the run —
    // unref() stops its listener from keeping jest's process alive after
    // the suites finish ("Jest did not exit one second after...").
    this.server.unref();
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => this.server.close((err) => (err ? reject(err) : resolve())));
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method === 'POST' && req.url === '/realms/damp/protocol/openid-connect/token') {
      this.grants += 1;
      return this.json(res, 200, { access_token: FAKE_SERVICE_TOKEN, expires_in: 300, token_type: 'Bearer' });
    }
    this.json(res, 404, { error: 'no route' });
  }

  private json(res: http.ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
  }
}
