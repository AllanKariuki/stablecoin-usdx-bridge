import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type JWTPayload, type KeyLike } from 'jose';

/**
 * FakeIssuer is the in-process OIDC issuer service test suites point their
 * AUTH_ISSUER_URL at: it serves /.well-known/openid-configuration plus a JWKS
 * document and mints signed tokens carrying whatever resource_access/azp a
 * test wants. Everything real about the verifier path is exercised — remote
 * JWKS fetch, issuer and audience matching, expiry — except the Keycloak
 * process itself.
 *
 * Usage (in a service test):
 *
 *   const issuer = await FakeIssuer.start();
 *   process.env.AUTH_ISSUER_URL = issuer.issuerUrl;
 *   process.env.AUTH_AUDIENCE = 'payments';
 *   const token = await issuer.mint({
 *     azp: 'svc-bff',
 *     resource_access: { payments: { roles: ['payments.user-proxy'] } },
 *   });
 *   await request(app.getHttpServer())
 *     .get('/payment-intents')
 *     .set('Authorization', `Bearer ${token}`)
 *     .expect(200);
 *   await issuer.close();
 */
export class FakeIssuer {
  readonly issuerUrl: string;

  private readonly privateKey: KeyLike;
  private readonly server: Server;
  private readonly audience: string;
  private readonly keyId: string;

  private constructor(
    issuerUrl: string,
    privateKey: KeyLike,
    server: Server,
    audience: string,
    keyId: string,
  ) {
    this.issuerUrl = issuerUrl;
    this.privateKey = privateKey;
    this.server = server;
    this.audience = audience;
    this.keyId = keyId;
  }

  /** Starts the issuer on an ephemeral port. The token minted by this issuer
   * carries `audience` (default 'fake-audience') in its aud claim. */
  static async start(options: { audience?: string } = {}): Promise<FakeIssuer> {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const publicJwk: JWK = await exportJWK(publicKey);
    const keyId = 'fake-key-1';
    publicJwk.kid = keyId;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    const audience = options.audience ?? 'fake-audience';

    let issuerUrl = '';
    const server: Server = http.createServer((req, res) => {
      const path = (req.url ?? '').split('?')[0];
      if (path === '/.well-known/openid-configuration') {
        const body = JSON.stringify({
          issuer: issuerUrl,
          jwks_uri: `${issuerUrl}/protocol/openid-connect/certs`,
        });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
        res.end(body);
        return;
      }
      if (path === '/protocol/openid-connect/certs') {
        const body = JSON.stringify({ keys: [publicJwk] });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
        res.end(body);
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    issuerUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return new FakeIssuer(issuerUrl, privateKey, server, audience, keyId);
  }

  /** Signs a token with this issuer's key. `aud` defaults to the issuer's
   * configured audience; pass `aud: [...]` in claims to override. */
  async mint(claims: JWTPayload = {}, options: { expiresIn?: string } = {}): Promise<string> {
    const jwt = new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: this.keyId })
      .setIssuer(this.issuerUrl)
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? '5m');
    if (!claims.aud) {
      jwt.setAudience(this.audience);
    }
    return jwt.sign(this.privateKey);
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      // The verifier's fetch keeps a keep-alive connection to this server in
      // its pool; without severing it, close() waits for the pool's idle
      // timeout and jest exits with an open handle. Destroying the sockets
      // lets the server (and the test process) shut down promptly.
      this.server.closeAllConnections?.();
      this.server.close(() => resolve());
    });
  }
}
