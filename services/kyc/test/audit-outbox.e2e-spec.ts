import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AUDIT, WORKFLOW_ACTOR } from '../src/audit/audit-actions';
import { CasesService } from '../src/cases/cases.service';
import { CoreLedgerClient } from '../src/core-ledger/core-ledger.client';
import { DbService } from '../src/db/db.service';
import { StubKycProvider } from '../src/providers/kyc-provider';
import { TiersRepository } from '../src/tiers/tiers.repository';
import { WorkflowClient } from '../src/workflow/workflow.client';

/**
 * Real Postgres, in kyc_test — never the dev database. workflow's HTTP call
 * and core-ledger are stand-ins; the digest is kyc's real local
 * implementation, because the refusal path depends on it.
 *
 *   KYC_TEST_DATABASE_URL=postgres://kyc:kyc@localhost:55433/kyc_test?sslmode=disable \
 *     pnpm --filter @damp/kyc test
 */
const TEST_DATABASE_URL =
  process.env.KYC_TEST_DATABASE_URL ?? 'postgres://kyc:kyc@localhost:55433/kyc_test?sslmode=disable';

describe('kyc audit producer (real Postgres)', () => {
  let db: DbService;
  let cases: CasesService;
  let workflow: WorkflowClient;

  beforeAll(async () => {
    const config = { get: (k: string) => (k === 'DATABASE_URL' ? TEST_DATABASE_URL : '') } as unknown as ConfigService;
    db = new DbService(config);
    await db.onModuleInit();
    workflow = new WorkflowClient(config);
    jest.spyOn(workflow, 'propose').mockImplementation(async () => ({ id: `req_${randomUUID()}` }) as never);
    const ledger = { setWalletsActive: async () => true } as unknown as CoreLedgerClient;
    cases = new CasesService(db, new TiersRepository(db), {} as StubKycProvider, workflow, ledger);
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  async function auditFor(subjectId: string) {
    const { rows } = await db.query<{ action: string; payload: Record<string, any> }>(
      `SELECT action, payload FROM audit_outbox WHERE payload->>'subject_id' = $1 ORDER BY id`,
      [subjectId],
    );
    return rows;
  }

  async function caseAwaitingReview() {
    const id = `kyc_${randomUUID()}`;
    await db.query(
      `INSERT INTO kyc_cases (id, party_id, requested_tier, status, provider_ref, risk_score)
       VALUES ($1, $2, 'TIER_1', 'PENDING_REVIEW', 'stub-ref', 12)`,
      [id, `party_${randomUUID()}`],
    );
    return id;
  }

  async function decisionFor(id: string) {
    const c = (await cases.find(id))!;
    return {
      requestId: c.approvalRequestId,
      subjectId: id,
      payloadDigest: workflow.digest({
        caseId: c.id,
        partyId: c.partyId,
        tier: c.requestedTier,
        riskScore: c.riskScore,
        providerRef: c.providerRef,
      }),
    };
  }

  it('audits review, then the approval that grants the tier, with the tier change in the event', async () => {
    const id = await caseAwaitingReview();
    await cases.review(id, 'reviewer-1', 'APPROVE', 'docs check out', { requestId: 'gw-k1', roles: ['compliance'] });
    await expect(cases.onApprovalDecision({ ...(await decisionFor(id)), status: 'APPROVED' })).resolves.toEqual({
      applied: true,
    });

    const events = await auditFor(id);
    expect(events.map((e) => e.action)).toEqual([AUDIT.reviewed, AUDIT.approved]);
    expect(events[0].payload).toMatchObject({ actor: 'reviewer-1', request_id: 'gw-k1', actor_roles: ['compliance'] });
    expect(events[1].payload).toMatchObject({
      actor: WORKFLOW_ACTOR,
      after_state: { status: 'APPROVED', tier: 'TIER_1' },
      metadata: { reviewedBy: 'reviewer-1' },
    });
  });

  it('audits a refused approval as DENIED and grants nothing', async () => {
    const id = await caseAwaitingReview();
    await cases.review(id, 'reviewer-2', 'APPROVE', '');
    const result = await cases.onApprovalDecision({
      ...(await decisionFor(id)),
      payloadDigest: 'sha256:forged',
      status: 'APPROVED',
    });
    expect(result.applied).toBe(false);
    expect((await auditFor(id)).map((e) => [e.action, e.payload.outcome])).toEqual([
      [AUDIT.reviewed, 'SUCCESS'],
      [AUDIT.approvalRefused, 'DENIED'],
    ]);
    expect((await cases.find(id))!.status).toBe('PENDING_APPROVAL');
  });

  it('audits a reviewer rejection with the status it came from', async () => {
    const id = await caseAwaitingReview();
    await cases.review(id, 'reviewer-3', 'REJECT', 'document mismatch');
    const events = await auditFor(id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: AUDIT.rejected,
      payload: {
        actor: 'reviewer-3',
        before_state: { status: 'PENDING_REVIEW' },
        after_state: { status: 'REJECTED' },
      },
    });
  });
});
