import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';
import { CoreLedgerClient } from '../core-ledger/core-ledger.client';
import { WorkflowClient } from './workflow.client';

export type EnforcementKind =
  | 'BLACKLIST'
  | 'UNBLACKLIST'
  | 'PAUSE'
  | 'UNPAUSE'
  | 'FREEZE_WALLET'
  | 'UNFREEZE_WALLET';

/**
 * Enforcement: the caller `COMPLIANCE_ROLE` and `PAUSER_ROLE` have been
 * waiting for since the contract was deployed.
 *
 * Every action here goes through maker-checker *before* anything is
 * submitted, and the reason is proportionate to what these do: blacklisting
 * freezes a holder's tokens, and pausing halts every transfer on the chain
 * for everybody. Neither is something one person should be able to do by
 * clicking a button, and the seeded policy for `compliance.pause` requires
 * two approvals.
 *
 * The on-chain half is deliberately *not* implemented here. Submitting a
 * `blacklist()` or `pause()` transaction means holding a key with
 * COMPLIANCE_ROLE, and P6 is where key custody is solved — until then this
 * service records an APPROVED action and stops, which is visibly incomplete
 * rather than quietly wrong. Wallet freezes, which need no key, execute
 * immediately.
 */
@Injectable()
export class EnforcementService {
  private readonly logger = new Logger(EnforcementService.name);

  constructor(
    private readonly db: DbService,
    private readonly workflow: WorkflowClient,
    private readonly ledger: CoreLedgerClient,
  ) {}

  async propose(input: {
    kind: EnforcementKind;
    chain?: string;
    target?: string;
    partyId?: string;
    caseId?: string;
    reason: string;
    requestedBy: string;
  }) {
    if (!input.reason?.trim()) {
      // Every one of these is defensible only with a reason, and a blank one
      // is what an audit finds three years later with nobody left who
      // remembers.
      throw new BadRequestException('a reason is required: enforcement without one is indefensible in review');
    }
    if ((input.kind === 'BLACKLIST' || input.kind === 'UNBLACKLIST') && !input.target) {
      throw new BadRequestException('blacklisting needs an address to blacklist');
    }
    if ((input.kind === 'FREEZE_WALLET' || input.kind === 'UNFREEZE_WALLET') && !input.partyId) {
      throw new BadRequestException('freezing needs a party');
    }

    const id = `enf_${randomUUID()}`;
    await this.db.query(
      `INSERT INTO enforcement_actions (id, kind, chain, target, party_id, case_id, reason, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        input.kind,
        input.chain ?? '',
        input.target ?? '',
        input.partyId ?? '',
        input.caseId ?? null,
        input.reason,
        input.requestedBy,
      ],
    );

    const action = this.policyFor(input.kind);
    const payload = {
      actionId: id,
      kind: input.kind,
      chain: input.chain ?? '',
      target: input.target ?? '',
      partyId: input.partyId ?? '',
    };

    const request = await this.workflow.propose({
      action,
      subjectType: 'ENFORCEMENT_ACTION',
      subjectId: id,
      payload,
      summary: { kind: input.kind, target: input.target ?? input.partyId, reason: input.reason },
      requestedBy: input.requestedBy,
      reason: input.reason,
    });

    if (!request) {
      // The action stays PENDING_APPROVAL. A compliance service that
      // blacklists anyway when its approval service is unreachable is a
      // compliance service with no maker-checker at all.
      this.logger.error(
        `could not open an approval for ${id}; it stays PENDING_APPROVAL until workflow is reachable`,
      );
      return { id, status: 'PENDING_APPROVAL', approvalRequestId: null };
    }

    await this.db.query('UPDATE enforcement_actions SET approval_request_id = $2 WHERE id = $1', [
      id,
      request.id,
    ]);
    return { id, status: 'PENDING_APPROVAL', approvalRequestId: request.id };
  }

  /**
   * workflow's callback. The digest is re-verified against the action as
   * stored, so an approval for a payload this service never proposed is
   * refused.
   */
  async onApprovalDecision(input: { subjectId: string; payloadDigest: string; status: string }) {
    const { rows } = await this.db.query<Record<string, any>>(
      'SELECT * FROM enforcement_actions WHERE id = $1',
      [input.subjectId],
    );
    const action = rows[0];
    if (!action) return { applied: false, reason: 'no such enforcement action' };
    if (action.status !== 'PENDING_APPROVAL') return { applied: false, reason: `action is ${action.status}` };

    const expected = this.workflow.digest({
      actionId: action.id,
      kind: action.kind,
      chain: action.chain,
      target: action.target,
      partyId: action.party_id,
    });

    if (expected !== input.payloadDigest) {
      this.logger.error(
        `REFUSING an approval for enforcement ${action.id}: the approved payload does not match. ` +
          `Either the action changed after approval, or the decision is not for what it claims.`,
      );
      return { applied: false, reason: 'payload digest mismatch' };
    }

    if (input.status !== 'APPROVED') {
      await this.db.query(`UPDATE enforcement_actions SET status = 'REJECTED' WHERE id = $1`, [action.id]);
      return { applied: true };
    }

    await this.db.query(`UPDATE enforcement_actions SET status = 'APPROVED' WHERE id = $1`, [action.id]);
    await this.execute(action);
    return { applied: true };
  }

  private async execute(action: Record<string, any>): Promise<void> {
    switch (action.kind) {
      case 'FREEZE_WALLET':
      case 'UNFREEZE_WALLET': {
        // No key needed: core-ledger's own wallet status, whose
        // ACCOUNT_FROZEN 409 every service already handles.
        const ok = await this.ledger.setWalletsStatus(
          action.party_id,
          action.kind === 'FREEZE_WALLET' ? 'FROZEN' : 'ACTIVE',
        );
        await this.db.query(
          `UPDATE enforcement_actions SET status = $2, executed_at = now(), failure_reason = $3 WHERE id = $1`,
          [action.id, ok ? 'EXECUTED' : 'FAILED', ok ? '' : 'core-ledger rejected the status change'],
        );
        return;
      }

      default:
        // BLACKLIST / PAUSE and their inverses need a key holding
        // COMPLIANCE_ROLE or PAUSER_ROLE. P6 is where key custody is solved;
        // until then the action sits APPROVED with an explicit reason rather
        // than being marked EXECUTED on the strength of nothing having
        // happened.
        await this.db.query(
          `UPDATE enforcement_actions SET status = 'APPROVED',
                  failure_reason = 'approved, awaiting on-chain submission: signing is services/signer (P6)'
            WHERE id = $1`,
          [action.id],
        );
        this.logger.warn(
          `${action.kind} ${action.target} is approved but cannot be submitted: no signer is configured (P6)`,
        );
    }
  }

  private policyFor(kind: EnforcementKind): string {
    if (kind === 'PAUSE' || kind === 'UNPAUSE') return 'compliance.pause';
    return 'compliance.blacklist';
  }
}
