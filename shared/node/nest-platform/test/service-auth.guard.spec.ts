import { Controller, Get, INestApplication, Post, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  CurrentUser,
  FakeIssuer,
  HmacAuthenticated,
  Public,
  RequireServiceRole,
  ServiceAuthGuard,
} from '../src';

/**
 * The guard's contract, against the in-process FakeIssuer: 401 without a
 * token, 401 with a wrong-audience or wrong-issuer token, 403 when the token
 * lacks the route's role, 200 when it holds one; @Public and
 * @HmacAuthenticated skip JWT entirely; the default role is
 * `<audience>.user-proxy`; and serviceIdentityFrom only releases the identity
 * headers to a user-proxy caller.
 */

const AUDIENCE = 'payments';

@Controller()
class UserFacingController {
  @Get('user-facing')
  userFacing(): string {
    return 'ok';
  }

  @Post('ingest')
  @RequireServiceRole('payments.ingest')
  ingest(): string {
    return 'ok';
  }

  @Get('propose-or-user')
  @RequireServiceRole('payments.propose', 'payments.user-proxy')
  proposeOrUser(): string {
    return 'ok';
  }
}

@Controller()
class SpecialController {
  @Get('public-route')
  @Public()
  publicRoute(): string {
    return 'ok';
  }

  @Post('hmac-route')
  @HmacAuthenticated()
  hmacRoute(): string {
    // The real HMAC check lives in the controller; the guard only skips JWT.
    return 'ok';
  }
}

@Controller()
class IdentityController {
  @Get('identity')
  identity(@CurrentUser() user: { userId: string; roles: string[] }): string {
    return `user=${user.userId} roles=${user.roles.join(',')}`;
  }

  // A route a non-user-proxy token can pass through the guard — so the
  // decorator's own gate (identity headers only from a user-proxy caller)
  // is what refuses, not the guard's role check.
  @Get('identity-loose')
  @RequireServiceRole('payments.ingest', 'payments.user-proxy')
  identityLoose(@CurrentUser() user: { userId: string }): string {
    return `user=${user.userId}`;
  }
}

async function appWith(issuerUrl: string, extraControllers: Type[] = []): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [UserFacingController, SpecialController, ...extraControllers],
    providers: [
      { provide: APP_GUARD, useClass: ServiceAuthGuard },
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => ({ AUTH_ISSUER_URL: issuerUrl, AUTH_AUDIENCE: AUDIENCE })[key],
        } as ConfigService,
      },
      Reflector,
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('ServiceAuthGuard', () => {
  let issuer: FakeIssuer;
  let app: INestApplication;

  beforeAll(async () => {
    issuer = await FakeIssuer.start({ audience: AUDIENCE });
    app = await appWith(issuer.issuerUrl, [IdentityController]);
  });

  afterAll(async () => {
    await app.close();
    await issuer.close();
  });

  const mint = (resourceAccess: Record<string, { roles: string[] }>, azp = 'svc-bff') =>
    issuer.mint({ azp, resource_access: resourceAccess });

  it('no token → 401 UNAUTHENTICATED', async () => {
    const res = await request(app.getHttpServer()).get('/user-facing');
    expect(res.status).toBe(401);
    expect((res.body as { code: string }).code).toBe('UNAUTHENTICATED');
  });

  it('garbage token → 401 UNAUTHENTICATED', async () => {
    const res = await request(app.getHttpServer()).get('/user-facing').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
    expect((res.body as { code: string }).code).toBe('UNAUTHENTICATED');
  });

  it('a token from a different issuer → 401', async () => {
    const other = await FakeIssuer.start({ audience: AUDIENCE });
    try {
      const token = await other.mint({ azp: 'svc-bff', resource_access: { payments: { roles: ['payments.user-proxy'] } } });
      const res = await request(app.getHttpServer()).get('/user-facing').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    } finally {
      await other.close();
    }
  });

  it('a token with the wrong audience → 401', async () => {
    const token = await issuer.mint({ azp: 'svc-kyc', aud: 'kyc', resource_access: { kyc: { roles: ['kyc.user-proxy'] } } });
    const res = await request(app.getHttpServer()).get('/user-facing').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('the right role opens the default user-proxy route', async () => {
    const token = await mint({ payments: { roles: ['payments.user-proxy'] } });
    const res = await request(app.getHttpServer()).get('/user-facing').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('a token without the route role → 403 FORBIDDEN', async () => {
    const token = await mint({ payments: { roles: ['payments.user-proxy'] } });
    const res = await request(app.getHttpServer()).post('/ingest').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe('FORBIDDEN');
  });

  it('an explicitly-declared role opens its route and no other', async () => {
    const ingest = await mint({ payments: { roles: ['payments.ingest'] } }, 'svc-payments');
    expect((await request(app.getHttpServer()).post('/ingest').set('Authorization', `Bearer ${ingest}`)).status).toBe(201);

    // ingest cannot reach a user-facing route: the default role there is
    // user-proxy, which this token does not hold.
    const denied = await request(app.getHttpServer()).get('/user-facing').set('Authorization', `Bearer ${ingest}`);
    expect(denied.status).toBe(403);
  });

  it('either of two declared roles suffices', async () => {
    const propose = await mint({ payments: { roles: ['payments.propose'] } }, 'svc-kyc');
    expect((await request(app.getHttpServer()).get('/propose-or-user').set('Authorization', `Bearer ${propose}`)).status).toBe(200);

    const userProxy = await mint({ payments: { roles: ['payments.user-proxy'] } });
    expect((await request(app.getHttpServer()).get('/propose-or-user').set('Authorization', `Bearer ${userProxy}`)).status).toBe(200);
  });

  it('@Public skips JWT verification', async () => {
    const res = await request(app.getHttpServer()).get('/public-route');
    expect(res.status).toBe(200);
  });

  it('@HmacAuthenticated skips JWT verification (the route owns its check)', async () => {
    const res = await request(app.getHttpServer()).post('/hmac-route');
    expect(res.status).toBe(201);
  });

  it('health probes are exempt without a token', async () => {
    // No health controller exists in this fixture, so a 404 (not a 401)
    // proves the guard let the probe path through untouched.
    const res = await request(app.getHttpServer()).get('/healthz');
    expect(res.status).toBe(404);
  });

  describe('serviceIdentityFrom', () => {
    it('releases identity headers only to a user-proxy caller', async () => {
      const userProxy = await mint({ payments: { roles: ['payments.user-proxy'] } });
      const ok = await request(app.getHttpServer())
        .get('/identity')
        .set('Authorization', `Bearer ${userProxy}`)
        .set('X-User-Id', 'party-1')
        .set('X-Roles', 'customer,')
        .set('X-Permissions', 'payments:read:own');
      expect(ok.status).toBe(200);
      expect(ok.text).toBe('user=party-1 roles=customer');

      const ingest = await mint({ payments: { roles: ['payments.ingest'] } }, 'svc-payments');
      // The guard lets this token through (the route declares its role), but
      // the decorator refuses to release identity headers to it.
      const denied = await request(app.getHttpServer())
        .get('/identity-loose')
        .set('Authorization', `Bearer ${ingest}`)
        .set('X-User-Id', 'party-1');
      expect(denied.status).toBe(401);
      expect((denied.body as { code: string }).code).toBe('MISSING_IDENTITY');
    });

    it('401s when the user-proxy caller omits X-User-Id', async () => {
      const userProxy = await mint({ payments: { roles: ['payments.user-proxy'] } });
      const res = await request(app.getHttpServer()).get('/identity').set('Authorization', `Bearer ${userProxy}`);
      expect(res.status).toBe(401);
      expect((res.body as { code: string }).code).toBe('MISSING_IDENTITY');
    });

    it('an expired token → 401 UNAUTHENTICATED', async () => {
      const expired = await issuer.mint(
        { azp: 'svc-bff', resource_access: { payments: { roles: ['payments.user-proxy'] } } },
        { expiresIn: '1s' },
      );
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const res = await request(app.getHttpServer()).get('/user-facing').set('Authorization', `Bearer ${expired}`);
      expect(res.status).toBe(401);
    });
  });
});
