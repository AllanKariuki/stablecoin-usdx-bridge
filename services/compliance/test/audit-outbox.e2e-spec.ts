import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AUDIT, WORKFLOW_ACTOR } from '../src/audit/audit-actions';
import { CasesController } from '../src/cases/cases.controller';
import { CoreLedgerClient } from '../src/core-ledger/core-ledger.client';
import { DbService } from '../src/db/db.service';
import { EnforcementService } from '../src/enforcement/enforcement.service';
import { WorkflowClient } from '../src/enforcement/workflow.client';
import { ScreeningService } from '../src/screening/screening.service';

/**
 * Real Postgres, in compliance_test — never the dev database. workflow and
 * core-ledger are stand-ins: what is under test is that each compliance
 * decision and its audit event are one transaction here.
 *
 *   COMPLIANCE_TEST_DATABASE_URL=postgres://compliance:compliance@localhost:55433/compliance_test?sslmode=disable \
 *     pnpm --filter @damp/compliance test
 */
const TEST_DATABASE_URL =
  process.env.COMPLIANCE_TEST_DATABASE_URL ??
  'postgres://compliance:compliance@localhost:55433/compliance_test?sslmode=disable';

describe('compliance audit producer (real Postgres)', () => {
  let db: DbService;
  let enforcement: EnforcementService;
  let cases: CasesController;
  const digest = (p: unknown) => JSON.stringify(p);

  beforeAll(async () => {
    db = new DbService({ get: () => TEST_DATABASE_URL } as unknown as ConfigService);
    await db.onModuleInit();
    const workflow = {
      propose: async () => ({ id: `req_${randomUUID()}` }),
      digest,
    } as unknown as WorkflowClient;
    const ledger = { setWalletsStatus: async () => true } as unknown as CoreLedgerClient;
    enforcement = new EnforcementService(db, workflow, ledger);
    cases = new CasesController(db, {} as ScreeningService, enforcement);
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

  async function approvalFor(id: string) {
    const { rows } = await db.query<Record<string, any>>('SELECT * FROM enforcement_actions WHERE id = $1', [id]);
    const a = rows[0];
    return {
      requestId: a.approval_request_id as string,
      subjectId: id,
      payloadDigest: digest({ actionId: a.id, kind: a.kind, chain: a.chain, target: a.target, partyId: a.party_id }),
    };
  }

  it('audits a freeze from proposal through approval to execution', async () => {
    const proposed = await enforcement.propose({
      kind: 'FREEZE_WALLET',
      partyId: `party_${randomUUID()}`,
      reason: 'structuring pattern',
      requestedBy: 'officer-1',
      audit: { requestId: 'gw-9', roles: ['compliance'] },
    });
    const decision = await approvalFor(proposed.id);
    await expect(enforcement.onApprovalDecision({ ...decision, status: 'APPROVED' })).resolves.toEqual({
      applied: true,
    });

    const events = await auditFor(proposed.id);
    expect(events.map((e) => e.action)).toEqual([
      AUDIT.enforcementProposed,
      AUDIT.enforcementApproved,
      AUDIT.enforcementExecuted,
    ]);
    expect(events[0].payload).toMatchObject({ actor: 'officer-1', request_id: 'gw-9', actor_roles: ['compliance'] });
    expect(events[1].payload.actor).toBe(WORKFLOW_ACTOR);
    expect(events[2].payload.after_state).toEqual({ status: 'EXECUTED' });
  });

  it('audits a refused approval as DENIED and changes nothing', async () => {
    const proposed = await enforcement.propose({
      kind: 'BLACKLIST',
      chain: 'ETHEREUM',
      target: '0x000000000000000000000000000000000000bEEF',
      reason: 'sanctions hit',
      requestedBy: 'officer-2',
    });
    const decision = await approvalFor(proposed.id);
    const result = await enforcement.onApprovalDecision({
      ...decision,
      payloadDigest: 'not-the-digest',
      status: 'APPROVED',
    });
    expect(result.applied).toBe(false);

    const events = await auditFor(proposed.id);
    expect(events.map((e) => [e.action, e.payload.outcome])).toEqual([
      [AUDIT.enforcementProposed, 'SUCCESS'],
      [AUDIT.approvalRefused, 'DENIED'],
    ]);
    const { rows } = await db.query<{ status: string }>('SELECT status FROM enforcement_actions WHERE id = $1', [
      proposed.id,
    ]);
    expect(rows[0].status).toBe('PENDING_APPROVAL');
  });

  it('audits a SAR closure with the narrative pinned by digest, not copied', async () => {
    const id = `case_${randomUUID()}`;
    await db.query(`INSERT INTO cases (id, reference, party_id, title) VALUES ($1, $2, $3, 'test case')`, [
      id,
      `REF-${randomUUID()}`,
      'party-x',
    ]);
    await cases.assign('lead-1', {}, id, { assignee: 'officer-3' });
    await cases.close('officer-3', { requestId: 'gw-10' }, id, { outcome: 'SAR', sarNarrative: 'the narrative' });

    const events = await auditFor(id);
    expect(events.map((e) => e.action)).toEqual([AUDIT.caseAssigned, AUDIT.caseClosed]);
    expect(events[0].payload).toMatchObject({ actor: 'lead-1', after_state: { assignedTo: 'officer-3' } });
    expect(events[1].payload).toMatchObject({
      actor: 'officer-3',
      after_state: { status: 'CLOSED_SAR' },
      metadata: { sarFiled: true },
    });
    expect(JSON.stringify(events[1].payload)).not.toContain('the narrative');
    expect(events[1].payload.metadata.sarNarrativeSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
