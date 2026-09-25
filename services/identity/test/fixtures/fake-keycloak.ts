import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';

interface FakeUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  attributes?: Record<string, string[]>;
  groups?: Array<{ id: string; name: string; path: string }>;
}

/**
 * A minimal, in-memory stand-in for Keycloak's Admin API — just the 3 calls
 * KeycloakAdminClient makes (client-credentials token, get-user, get-user's
 * -groups). Same pattern as bff's FakeCoreLedger
 * (services/bff/test/fixtures/fake-core-ledger.ts): a real HTTP server, so
 * identity's specs exercise the client's request/response handling for
 * real rather than risking a mocked fetch() drifting from Keycloak's
 * actual shapes.
 */
export class FakeKeycloak {
  private server: Server;
  private users = new Map<string, FakeUser>();

  constructor() {
    this.server = http.createServer((req, res) => this.route(req, res));
  }

  seedUser(user: FakeUser): void {
    this.users.set(user.id, user);
  }

  async listen(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => this.server.close((err) => (err ? reject(err) : resolve())));
  }

  private route(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://internal');
    const method = req.method ?? 'GET';

    if (method === 'POST' && url.pathname === '/realms/damp/protocol/openid-connect/token') {
      return this.json(res, 200, { access_token: 'fake-token', expires_in: 300, token_type: 'Bearer' });
    }

    const userMatch = url.pathname.match(/^\/admin\/realms\/damp\/users\/([^/]+)$/);
    if (method === 'GET' && userMatch) {
      const user = this.users.get(decodeURIComponent(userMatch[1]));
      if (!user) return this.json(res, 404, { error: 'not found' });
      const { id, username, email, firstName, lastName, attributes } = user;
      return this.json(res, 200, { id, username, email, firstName, lastName, attributes });
    }

    const groupsMatch = url.pathname.match(/^\/admin\/realms\/damp\/users\/([^/]+)\/groups$/);
    if (method === 'GET' && groupsMatch) {
      const user = this.users.get(decodeURIComponent(groupsMatch[1]));
      return this.json(res, 200, user?.groups ?? []);
    }

    this.json(res, 404, { error: 'no route' });
  }

  private json(res: http.ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
  }
}
