import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FakeIssuer, ServiceAuthGuard } from '@damp/nest-platform';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DbService } from '../src/db/db.service';
import { RequestsController } from '../src/requests/requests.controller';
import { AUDIT, RequestsService } from '../src/requests/requests.service';

/**
 * The controller boundary, over HTTP, against real Postgres (workflow_test).
 *
 * audit-outbox.e2e-spec.ts exercises RequestsService with roles handed to it
 * directly. These tests exist because the bug they guard against lived one
 * layer up: the controller used to pass roles from the request body, so a
 * caller could approve anything by claiming a role. What is asserted here is
 * where identity comes from — X-User-Id and X-Roles, which only auth-proxy
 * can set — and that nothing a body says changes it.
 *
 * Since H3 the guard sits on this module too (as it does in app.module.ts),
 * and `as()` mints a real svc-bff token (workflow.user-proxy) against an
 * in-process issuer — so the identity headers are exactly as trustworthy
 * here as they are in production.
 */
const TEST_DATABASE_URL =
  process.env.WORKFLOW_TEST_DATABASE_URL ??
  'postgres://workflow:workflow@localhost:55433/workflow_test?sslmode=disable';

describe('workflow gateway identity (HTTP, real Postgres)', () => {
  let app: INestApplication;
  let db: DbService;
  let issuer: FakeIssuer;

  beforeAll(async () => {
    issuer = await FakeIssuer.start({ audience: 'workflow' });

    // Not initialised here: app.init() runs DbService's lifecycle hooks on the
    // instance it is handed (opening the pool and migrating), and app.close()
    // ends it. Calling either by hand as well opens a second pool or ends one
    // twice.
    db = new DbService({ get: () => TEST_DATABASE_URL } as unknown as ConfigService);
    const moduleRef = await Test.createTestingModule({
      controllers: [RequestsController],
      providers: [
        RequestsService,
        { provide: DbService, useValue: db },
        { provide: APP_GUARD, useClass: ServiceAuthGuard },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => ({ AUTH_ISSUER_URL: issuer.issuerUrl, AUTH_AUDIENCE: 'workflow' })[key],
          },
        },
        Reflector,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await issuer.close();
  });

  /** What auth-proxy would set for this person, via Traefik and bff — plus
   * bff's own service token, which is what lets the headers be trusted. */
  async function as(userId: string, roles: string[] = []) {
    const token = await issuer.mint({
      azp: 'svc-bff',
      resource_access: { workflow: { roles: ['workflow.user-proxy'] } },
    });
    return { Authorization: `Bearer ${token}`, 'X-User-Id': userId, 'X-Roles': roles.join(',') };
  }

  /** A one-of-one, treasury-only, exclude_initiator policy. */
  async function proposeReversal(maker = 'maker-1') {
    const res = await request(app.getHttpServer())
      .post('/approval-requests')
      .set(await as(maker, ['treasury']))
      .send({
        action: 'ledger.reversal',
        subjectType: 'JOURNAL_TX',
        subjectId: `jtx_${randomUUID()}`,
        payload: { tx: randomUUID() },
        reason: 'posted to the wrong account',
      })
      .expect(201);
    return res.body as { id: string; status: string };
  }

  async function auditFor(subjectId: string) {
    const { rows } = await db.query<{ action: string; payload: Record<string, any> }>(
      `SELECT action, payload FROM audit_outbox WHERE payload->>'subject_id' = $1 ORDER BY id`,
      [subjectId],
    );
    return rows;
  }

  async function approvalsFor(requestId: string) {
    const { rows } = await db.query('SELECT decided_by FROM approvals WHERE request_id = $1', [requestId]);
    return rows;
  }

  it('approves when the role comes from X-Roles, and records those roles as the authority', async () => {
    const req = await proposeReversal();
    const res = await request(app.getHttpServer())
      .post(`/approval-requests/${req.id}/approve`)
      .set(await as('checker-1', ['treasury']))
      .send({ comment: 'matches the ticket' })
      .expect(200);
    expect(res.body.status).toBe('APPROVED');

    const events = await auditFor(req.id);
    expect(events.map((e) => e.action)).toEqual([AUDIT.proposed, AUDIT.approved]);
    expect(events[1].payload.actor).toBe('checker-1');
    expect(events[1].payload.actor_roles).toEqual(['treasury']);
    expect(events[1].payload.metadata).not.toHaveProperty('claimedRoles');
  });

  it('enforces the required role from X-Roles, and audits the refusal as DENIED', async () => {
    const req = await proposeReversal();
    await request(app.getHttpServer())
      .post(`/approval-requests/${req.id}/approve`)
      .set(await as('checker-1', ['compliance']))
      .send({})
      .expect(403);

    expect(await approvalsFor(req.id)).toHaveLength(0);
    const events = await auditFor(req.id);
    expect(events.map((e) => [e.action, e.payload.outcome])).toEqual([
      [AUDIT.proposed, 'SUCCESS'],
      [AUDIT.approved, 'DENIED'],
    ]);
    expect(events[1].payload.actor_roles).toEqual(['compliance']);
    expect(events[1].payload.metadata).toMatchObject({ reason: 'missing approver role', approverRoles: ['treasury'] });
  });

  it('refuses a decider with no roles at all', async () => {
    const req = await proposeReversal();
    // A real svc-bff token with an identity header but no X-Roles: the guard
    // lets it through, and the controller's own role check is what refuses.
    await request(app.getHttpServer())
      .post(`/approval-requests/${req.id}/approve`)
      .set(await as('checker-1'))
      .send({})
      .expect(403);
    expect(await approvalsFor(req.id)).toHaveLength(0);

    // Without any service token the guard refuses first — the same 401 the
    // real boundary returns, before any decision can be attempted.
    await request(app.getHttpServer())
      .post(`/approval-requests/${req.id}/approve`)
      .set({ 'X-User-Id': 'checker-1' })
      .send({})
      .expect(401);
    expect(await approvalsFor(req.id)).toHaveLength(0);
  });

  it('rejects a body that claims roles, without deciding or auditing anything', async () => {
    const req = await proposeReversal();
    // The exploit the old contract allowed: no approver role from the
    // gateway, `treasury` asserted in the body.
    const res = await request(app.getHttpServer())
      .post(`/approval-requests/${req.id}/approve`)
      .set(await as('checker-1', ['customer']))
      .send({ roles: ['treasury'] })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('ROLES_NOT_ACCEPTED');

    // Refused before the service is reached, so no DENIED event either: the
    // request never became a decision attempt.
    expect(await approvalsFor(req.id)).toHaveLength(0);
    expect((await auditFor(req.id)).map((e) => e.action)).toEqual([AUDIT.proposed]);
  });

  it('rejects claimed roles on reject and propose too, even when they match the gateway', async () => {
    const req = await proposeReversal();
    await request(app.getHttpServer())
      .post(`/approval-requests/${req.id}/reject`)
      .set(await as('checker-1', ['treasury']))
      .send({ roles: ['treasury'] })
      .expect(400);

    await request(app.getHttpServer())
      .post('/approval-requests')
      .set(await as('maker-1', ['treasury']))
      .send({
        action: 'ledger.reversal',
        subjectType: 'JOURNAL_TX',
        subjectId: `jtx_${randomUUID()}`,
        payload: {},
        roles: ['treasury'],
      })
      .expect(400);

    expect((await db.query('SELECT status FROM approval_requests WHERE id = $1', [req.id])).rows[0].status).toBe(
      'PENDING',
    );
  });

  it('refuses a decision with no X-User-Id', async () => {
    const req = await proposeReversal();
    await request(app.getHttpServer())
      .post(`/approval-requests/${req.id}/approve`)
      .set({ 'X-Roles': 'treasury' })
      .send({})
      .expect(401);
    expect(await approvalsFor(req.id)).toHaveLength(0);
    expect((await auditFor(req.id)).map((e) => e.action)).toEqual([AUDIT.proposed]);
  });

  it('refuses a proposal with no X-User-Id', async () => {
    await request(app.getHttpServer())
      .post('/approval-requests')
      .send({ action: 'ledger.reversal', subjectType: 'JOURNAL_TX', subjectId: `jtx_${randomUUID()}`, payload: {} })
      .expect(401);
  });

  it('still refuses self-approval when the proposer holds the approver role', async () => {
    const req = await proposeReversal('maker-7');
    await request(app.getHttpServer())
      .post(`/approval-requests/${req.id}/approve`)
      .set(await as('maker-7', ['treasury']))
      .send({})
      .expect(403);
    expect(await approvalsFor(req.id)).toHaveLength(0);
    const events = await auditFor(req.id);
    expect(events[1].payload).toMatchObject({ actor: 'maker-7', outcome: 'DENIED' });
  });

  it('records the proposer’s gateway roles, not anything they assert', async () => {
    const req = await proposeReversal('maker-3');
    const { rows } = await db.query<{ requested_by: string; requested_by_roles: string[] }>(
      'SELECT requested_by, requested_by_roles FROM approval_requests WHERE id = $1',
      [req.id],
    );
    expect(rows[0]).toEqual({ requested_by: 'maker-3', requested_by_roles: ['treasury'] });
    expect((await auditFor(req.id))[0].payload.actor_roles).toEqual(['treasury']);
  });

  it('parses X-Roles the way auth-proxy writes it, tolerating spaces and blanks', async () => {
    const req = await proposeReversal();
    await request(app.getHttpServer())
      .post(`/approval-requests/${req.id}/approve`)
      .set(await as('checker-1', ['customer', 'treasury', ' ']))
      .send({})
      .expect(200);
    expect((await auditFor(req.id))[1].payload.actor_roles).toEqual(['customer', 'treasury']);
  });
});
