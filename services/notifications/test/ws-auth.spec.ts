import http, { IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { WsAuth } from '../src/ws/ws.auth';

// The browser's tokens name the issuer it reached Keycloak on; inside a
// container that address is unreachable, so the keys must be fetchable from
// somewhere else without changing what `iss` is checked against.
const ISSUER = 'http://localhost:8080/realms/damp';

describe('WsAuth', () => {
  let server: Server;
  let jwksUrl: string;
  let privateKey: CryptoKey;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey as CryptoKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    jwksUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/certs`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const auth = (env: Record<string, string>) =>
    new WsAuth({ get: (key: string) => env[key] } as unknown as ConfigService);

  const upgrade = (token: string) => ({ url: `/ws?token=${token}` }) as IncomingMessage;

  const token = (issuer: string) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(issuer)
      .setAudience('damp-portal')
      .setSubject('subject-1')
      .setExpirationTime('5m')
      .sign(privateKey);

  it('verifies against keys from KEYCLOAK_JWKS_URL while still checking the browser-facing issuer', async () => {
    const ws = auth({ KEYCLOAK_ISSUER_URL: ISSUER, KEYCLOAK_JWKS_URL: jwksUrl, OIDC_AUDIENCE: 'damp-portal' });
    await expect(ws.resolve(upgrade(await token(ISSUER)))).resolves.toBe('subject-1');
  });

  it('rejects a token from another issuer even when the keys verify', async () => {
    const ws = auth({ KEYCLOAK_ISSUER_URL: ISSUER, KEYCLOAK_JWKS_URL: jwksUrl, OIDC_AUDIENCE: 'damp-portal' });
    await expect(ws.resolve(upgrade(await token('http://keycloak:8080/realms/damp')))).resolves.toBeNull();
  });
});
