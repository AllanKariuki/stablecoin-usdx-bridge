import { ConfigService } from '@nestjs/config';
import { ServiceTokenClient } from '@damp/nest-platform';
import { EnforcementService } from '../src/enforcement/enforcement.service';
import { CoreLedgerClient, EnforceOutcome } from '../src/core-ledger/core-ledger.client';
import { WorkflowClient } from '../src/enforcement/workflow.client';
import { DbService } from '../src/db/db.service';

/**
 * H6: an approved BLACKLIST/UNBLACKLIST/PAUSE/UNPAUSE action is submitted to
 * core-ledger's POST /chain/enforcement and its outcome is recorded — 202
 * marks SUBMITTED (finality arrives via the ingest event), a retried call's
 * 200 FINAL/FAILED and a 409 are recorded exactly as the event would have
 * been, and a transient failure keeps the action APPROVED with a retryable
 * reason (safe: core-ledger dedupes on the action id).
 */

// A recording stand-in for DbService: enough query surface for the service's
// statements plus the audit enqueue, and a record of everything written.
type Row = Record<string, unknown>;

class FakeDb {
  rows: Row[] = [];
  calls: Array<{ sql: string; params: unknown[] }> = [];

  constructor(actionRow: Row) {
    this.rows = [actionRow];
  }

  async query(sql: string, params: unknown[] = []): Promise<{ rows: Row[] }> {
    this.calls.push({ sql, params });
    // The action lookup filters by id — the harness's stand-in for a real
    // WHERE clause, so an unknown reference finds nothing.
    if (sql.includes('SELECT * FROM enforcement_actions')) {
      return { rows: this.rows.filter((r) => r.id === params[0]) };
    }
    return { rows: [] };
  }

  async transaction<T>(fn: (client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<T>): Promise<T> {
    return fn({ query: (sql, params = []) => { this.calls.push({ sql, params }); return Promise.resolve({ rows: [] }); } });
  }

  /** Every UPDATE on enforcement_actions, in order. */
  enforcementUpdates(): Array<{ sql: string; params: unknown[] }> {
    return this.calls.filter((c) => c.sql.includes('UPDATE enforcement_actions'));
  }
}

class FakeLedger {
  outcome: EnforceOutcome = { status: 'SUBMITTED', txHash: '0xabc' };
  enforced: Array<{
    action: string;
    chain: string;
    address?: string;
    reference: string;
  }> = [];

  async enforce(input: {
    action: 'BLACKLIST' | 'UNBLACKLIST' | 'PAUSE' | 'UNPAUSE';
    chain: string;
    address?: string;
    reference: string;
  }): Promise<EnforceOutcome> {
    this.enforced.push(input);
    return this.outcome;
  }
}

function actionRow(over: Row = {}): Row {
  return {
    id: 'enf_1',
    kind: 'BLACKLIST',
    chain: 'ETHEREUM',
    target: '0x00000000000000000000000000000000000000E1',
    party_id: '',
    status: 'PENDING_APPROVAL',
    approval_request_id: 'req_1',
    ...over,
  };
}

function harness(over: Row = {}) {
  const db = new FakeDb(actionRow(over));
  const ledger = new FakeLedger();

  const config = {
    get: (key: string) => ({ WORKFLOW_URL: 'http://workflow', KEYCLOAK_BASE_URL: 'http://kc', KEYCLOAK_REALM: 'damp', SERVICE_CLIENT_ID: 'svc-compliance', SERVICE_CLIENT_SECRET: 's' })[key],
  } as unknown as ConfigService;
  const workflow = new WorkflowClient(config, new ServiceTokenClient(config));
  const service = new EnforcementService(
    db as unknown as DbService,
    workflow,
    ledger as unknown as CoreLedgerClient,
  );

  const decide = (requestId: string, subjectId: string, status = 'APPROVED') => {
    // The digest the service verifies is recomputed from the stored row —
    // the same payload workflow would have digested at proposal time.
    const row = db.rows[0];
    const payload = { actionId: row.id, kind: row.kind, chain: row.chain, target: row.target, partyId: row.party_id };
    return service.onApprovalDecision({
      requestId,
      subjectId,
      payloadDigest: workflow.digest(payload),
      status,
    });
  };

  return { db, ledger, workflow, service, decide };
}

describe('EnforcementService on-chain execution (H6)', () => {
  it('submits an approved action to core-ledger and records SUBMITTED with the tx hash', async () => {
    const { db, ledger, decide } = harness();

    const result = await decide('req_1', 'enf_1');
    expect(result).toEqual({ applied: true });

    expect(ledger.enforced).toEqual([
      {
        action: 'BLACKLIST',
        chain: 'ETHEREUM',
        address: '0x00000000000000000000000000000000000000E1',
        reference: 'enf_1',
      },
    ]);

    const updates = db.enforcementUpdates();
    expect(updates).toHaveLength(2); // APPROVED, then SUBMITTED
    const submitted = updates[1];
    expect(submitted.sql).toContain(`status = 'SUBMITTED'`);
    expect(submitted.params[1]).toBe('0xabc'); // chain_tx_hash
  });

  it('records a retried call finding the reference already FINAL as EXECUTED', async () => {
    const { db, ledger, decide } = harness();
    ledger.outcome = { status: 'FINAL', txHash: '0xdef' };

    await decide('req_1', 'enf_1');

    const executed = db.enforcementUpdates()[1];
    expect(executed.params[1]).toBe('EXECUTED');
    expect(executed.params[2]).toBe('0xdef');
    expect(executed.params[3]).toBe('');
  });

  it('records a retried call finding the reference already FAILED as FAILED with the reason', async () => {
    const { db, ledger, decide } = harness();
    ledger.outcome = { status: 'FAILED', reason: 'the chain refused' };

    await decide('req_1', 'enf_1');

    const failed = db.enforcementUpdates()[1];
    expect(failed.params[1]).toBe('FAILED');
    expect(failed.params[2]).toBeNull();
    expect(failed.params[3]).toBe('the chain refused');
  });

  it('records a terminal 409 as FAILED with the reason', async () => {
    const { db, ledger, decide } = harness();
    ledger.outcome = { status: 'TERMINAL_FAILED', reason: 'execution reverted: AccessControl' };

    await decide('req_1', 'enf_1');

    const failed = db.enforcementUpdates()[1];
    expect(failed.params[1]).toBe('FAILED');
    expect(failed.params[3]).toBe('execution reverted: AccessControl');
  });

  it('keeps the action APPROVED on a transient failure, with a retryable reason', async () => {
    const { db, ledger, decide } = harness();
    ledger.outcome = { status: 'TRANSIENT', reason: 'core-ledger unreachable' };

    await decide('req_1', 'enf_1');

    const updates = db.enforcementUpdates();
    expect(updates).toHaveLength(2);
    // The execution write only touches failure_reason: status stays APPROVED.
    const write = updates[1];
    expect(write.params).toHaveLength(2);
    expect(String(write.params[1])).toContain('core-ledger unreachable');
    expect(String(write.params[1])).toContain('dedupes on the action id');
    // No EXECUTED/FAILED audit event for a submission that never confirmed.
    const audits = db.calls.filter((c) => c.sql.includes('INSERT INTO audit_outbox') && (c.params[1] as string) === 'compliance.enforcement.executed');
    expect(audits).toHaveLength(0);
  });

  it('audits the execution outcome in the same transaction', async () => {
    const { db, ledger, decide } = harness();
    ledger.outcome = { status: 'FINAL', txHash: '0xdef' };

    await decide('req_1', 'enf_1');

    const audit = db.calls.find((c) => c.sql.includes('INSERT INTO audit_outbox') && (c.params[1] as string) === 'compliance.enforcement.executed');
    expect(audit).toBeDefined();
    const payload = JSON.parse(audit!.params[2] as string) as { actor: string; outcome: string };
    expect(payload.actor).toBe('service:workflow');
    expect(payload.outcome).toBe('SUCCESS');
  });

  it('still submits when the action names no target (PAUSE carries no address)', async () => {
    const { ledger, decide } = harness({ kind: 'PAUSE', target: '' });

    await decide('req_1', 'enf_1');

    expect(ledger.enforced[0]).toEqual({
      action: 'PAUSE',
      chain: 'ETHEREUM',
      address: undefined,
      reference: 'enf_1',
    });
  });
});

describe('EnforcementService.applyChainOutcome (the ingest path)', () => {
  it('marks a SUBMITTED action EXECUTED with the event tx hash', async () => {
    const { db, service } = harness({ status: 'SUBMITTED' });

    const result = await service.applyChainOutcome({
      reference: 'enf_1',
      status: 'FINAL',
      txHash: '0xabc',
      failureReason: '',
    });
    expect(result).toEqual({ applied: true });

    const executed = db.enforcementUpdates()[0];
    expect(executed.params[1]).toBe('EXECUTED');
    expect(executed.params[2]).toBe('0xabc');
  });

  it('marks a SUBMITTED action FAILED with the event reason', async () => {
    const { db, service } = harness({ status: 'SUBMITTED' });

    const result = await service.applyChainOutcome({
      reference: 'enf_1',
      status: 'FAILED',
      txHash: '0xabc',
      failureReason: 'reverted on chain',
    });
    expect(result).toEqual({ applied: true });

    const failed = db.enforcementUpdates()[0];
    expect(failed.params[1]).toBe('FAILED');
    expect(failed.params[3]).toBe('reverted on chain');
  });

  it('is idempotent on redelivery', async () => {
    const { db, service } = harness({ status: 'EXECUTED' });

    const result = await service.applyChainOutcome({
      reference: 'enf_1',
      status: 'FINAL',
      txHash: '0xabc',
      failureReason: '',
    });
    expect(result).toEqual({ applied: false, reason: 'action is EXECUTED' });
    expect(db.enforcementUpdates()).toHaveLength(0);
  });

  it('ignores an unknown reference', async () => {
    const { db, service } = harness({ status: 'SUBMITTED' });

    const result = await service.applyChainOutcome({
      reference: 'enf_never',
      status: 'FINAL',
      txHash: '0xabc',
      failureReason: '',
    });
    expect(result).toEqual({ applied: false, reason: 'no such enforcement action' });
    expect(db.enforcementUpdates()).toHaveLength(0);
  });
});
