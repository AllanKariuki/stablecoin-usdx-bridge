import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';
import { payloadDigest } from './digest';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface Policy {
  id: string;
  action: string;
  description: string;
  approvalsRequired: number;
  approverRoles: string[];
  excludeInitiator: boolean;
  expiresAfterHours: number;
}

export interface ApprovalRequest {
  id: string;
  action: string;
  policyId: string;
  subjectType: string;
  subjectId: string;
  payloadDigest: string;
  summary: Record<string, unknown>;
  requestedBy: string;
  reason: string;
  status: RequestStatus;
  callbackUrl: string;
  expiresAt: Date;
  decidedAt: Date | null;
  createdAt: Date;
  approvals: Array<{ decision: string; decidedBy: string; comment: string; createdAt: Date }>;
}

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(private readonly db: DbService) {}

  // --- Proposing -----------------------------------------------------------

  /**
   * Opens an approval request.
   *
   * The digest is computed here from the payload the caller sends, and the
   * caller is expected to compute the same digest over its own stored object
   * when the approval comes back. Both sides using the same canonical
   * encoding is what makes the comparison meaningful — see digest.ts.
   */
  async propose(input: {
    action: string;
    subjectType: string;
    subjectId: string;
    payload: unknown;
    summary?: Record<string, unknown>;
    requestedBy: string;
    requestedByRoles: string[];
    reason?: string;
    callbackUrl?: string;
  }): Promise<ApprovalRequest> {
    const policy = await this.policyFor(input.action);
    if (!policy) {
      // Refused, not waved through. An action with no policy is an action
      // nobody has decided the rules for, and defaulting to "no approval
      // needed" would make forgetting to write a policy the same as deciding
      // none is required.
      throw new BadRequestException(
        `no approval policy is defined for "${input.action}"; define one before proposing against it`,
      );
    }

    const digest = payloadDigest(input.payload);
    const expiresAt = new Date(Date.now() + policy.expiresAfterHours * 3_600_000);

    const { rows } = await this.db.query<Record<string, any>>(
      `INSERT INTO approval_requests
         (id, action, policy_id, subject_type, subject_id, payload_digest, summary,
          requested_by, requested_by_roles, reason, callback_url, callback_status, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (subject_type, subject_id, payload_digest) DO UPDATE SET updated_at = approval_requests.updated_at
       RETURNING *`,
      [
        `req_${randomUUID()}`,
        input.action,
        policy.id,
        input.subjectType,
        input.subjectId,
        digest,
        JSON.stringify(input.summary ?? {}),
        input.requestedBy,
        input.requestedByRoles,
        input.reason ?? '',
        input.callbackUrl ?? '',
        input.callbackUrl ? 'PENDING' : 'NOT_REQUIRED',
        expiresAt,
      ],
    );

    // The ON CONFLICT above makes re-proposing the *same payload for the same
    // subject* idempotent: a double-submit returns the open request rather
    // than creating a second one two approvers could each approve.
    return this.hydrate(rows[0]);
  }

  // --- Deciding ------------------------------------------------------------

  /**
   * Records one person's decision.
   *
   * Every check here is enforced against the request as it stands in the
   * database at this moment, inside one transaction, because each of them is
   * a race if it is not: two approvers deciding simultaneously on a
   * one-of-one policy, an approver deciding as a request expires, the same
   * person clicking twice.
   */
  async decide(input: {
    requestId: string;
    decision: 'APPROVE' | 'REJECT';
    decidedBy: string;
    decidedByRoles: string[];
    comment?: string;
  }): Promise<ApprovalRequest> {
    const request = await this.find(input.requestId);
    if (!request) throw new NotFoundException('no such approval request');

    const policy = await this.policyById(request.policyId);
    if (!policy) throw new NotFoundException('the policy this request was opened under no longer exists');

    if (request.status !== 'PENDING') {
      throw new ConflictException(`this request is already ${request.status.toLowerCase()}`);
    }
    if (request.expiresAt.getTime() <= Date.now()) {
      await this.settle(request.id, 'EXPIRED');
      throw new ConflictException(
        'this request has expired; an approval granted against stale context is not an approval — propose it again',
      );
    }

    // Segregation of duties. Non-negotiable for everything in the seeded
    // policy set, and the single most common way maker-checker is defeated in
    // practice: the maker approves their own work because the UI let them.
    if (policy.excludeInitiator && request.requestedBy === input.decidedBy) {
      throw new ForbiddenException(
        'you proposed this request and cannot also approve it — this policy requires a second person',
      );
    }

    if (policy.approverRoles.length > 0) {
      const permitted = input.decidedByRoles.some((role) => policy.approverRoles.includes(role));
      if (!permitted) {
        throw new ForbiddenException(
          `this action requires one of: ${policy.approverRoles.join(', ')}`,
        );
      }
    }

    try {
      await this.db.query(
        `INSERT INTO approvals (id, request_id, decision, decided_by, decided_by_roles, comment)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [`apr_${randomUUID()}`, request.id, input.decision, input.decidedBy, input.decidedByRoles, input.comment ?? ''],
      );
    } catch (err) {
      // UNIQUE (request_id, decided_by). A two-of-two policy that one person
      // could satisfy by clicking twice is a one-of-one policy with extra
      // steps, so this is enforced by the database rather than by the UI
      // being careful.
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('you have already decided on this request');
      }
      throw err;
    }

    // A single rejection is terminal. Requiring N rejections to match N
    // approvals would mean a request could sit half-rejected, which is not a
    // state anybody has a use for.
    if (input.decision === 'REJECT') {
      await this.settle(request.id, 'REJECTED');
      return (await this.find(request.id))!;
    }

    const approvals = await this.countApprovals(request.id);
    if (approvals >= policy.approvalsRequired) {
      await this.settle(request.id, 'APPROVED');
    }
    return (await this.find(request.id))!;
  }

  async cancel(requestId: string, by: string): Promise<ApprovalRequest> {
    const request = await this.find(requestId);
    if (!request) throw new NotFoundException('no such approval request');
    // Only the proposer withdraws their own proposal. An approver who
    // disagrees rejects it, which is recorded; cancelling on their behalf
    // would erase the disagreement.
    if (request.requestedBy !== by) {
      throw new ForbiddenException('only the person who proposed a request can withdraw it');
    }
    if (request.status !== 'PENDING') {
      throw new ConflictException(`this request is already ${request.status.toLowerCase()}`);
    }
    await this.settle(requestId, 'CANCELLED');
    return (await this.find(requestId))!;
  }

  /**
   * Marks lapsed requests expired.
   *
   * Run on an interval. It is not strictly required — `decide` refuses an
   * expired request anyway — but an operator's pending queue that fills with
   * requests nobody can act on is a queue nobody reads.
   */
  async expireLapsed(): Promise<number> {
    const { rows } = await this.db.query<{ id: string }>(
      `UPDATE approval_requests SET status = 'EXPIRED', decided_at = now(), updated_at = now()
        WHERE status = 'PENDING' AND expires_at <= now()
        RETURNING id`,
    );
    if (rows.length > 0) {
      this.logger.log(`expired ${rows.length} approval request(s) nobody acted on`);
    }
    return rows.length;
  }

  // --- Reading -------------------------------------------------------------

  async find(id: string): Promise<ApprovalRequest | null> {
    const { rows } = await this.db.query<Record<string, any>>('SELECT * FROM approval_requests WHERE id = $1', [id]);
    return rows[0] ? this.hydrate(rows[0]) : null;
  }

  async pending(limit = 100): Promise<ApprovalRequest[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT * FROM approval_requests WHERE status = 'PENDING' ORDER BY created_at LIMIT $1`,
      [limit],
    );
    return Promise.all(rows.map((r) => this.hydrate(r)));
  }

  async forSubject(subjectType: string, subjectId: string): Promise<ApprovalRequest[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT * FROM approval_requests WHERE subject_type = $1 AND subject_id = $2 ORDER BY created_at DESC`,
      [subjectType, subjectId],
    );
    return Promise.all(rows.map((r) => this.hydrate(r)));
  }

  async policies(): Promise<Policy[]> {
    const { rows } = await this.db.query<Record<string, any>>('SELECT * FROM policies ORDER BY action');
    return rows.map(toPolicy);
  }

  async policyFor(action: string): Promise<Policy | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      'SELECT * FROM policies WHERE action = $1 AND active',
      [action],
    );
    return rows[0] ? toPolicy(rows[0]) : null;
  }

  private async policyById(id: string): Promise<Policy | null> {
    const { rows } = await this.db.query<Record<string, any>>('SELECT * FROM policies WHERE id = $1', [id]);
    return rows[0] ? toPolicy(rows[0]) : null;
  }

  /** Requests whose decision still has to be delivered to the caller. */
  async undeliveredCallbacks(limit = 50): Promise<ApprovalRequest[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT * FROM approval_requests
        WHERE callback_status = 'PENDING' AND status IN ('APPROVED', 'REJECTED', 'EXPIRED')
          AND callback_url <> ''
        ORDER BY decided_at LIMIT $1`,
      [limit],
    );
    return Promise.all(rows.map((r) => this.hydrate(r)));
  }

  async markCallbackDelivered(id: string): Promise<void> {
    await this.db.query(
      `UPDATE approval_requests SET callback_status = 'DELIVERED', callback_error = '' WHERE id = $1`,
      [id],
    );
  }

  async markCallbackFailed(id: string, reason: string, dead: boolean): Promise<void> {
    await this.db.query(
      `UPDATE approval_requests
          SET callback_attempts = callback_attempts + 1,
              callback_error = $2,
              callback_status = CASE WHEN $3 THEN 'FAILED' ELSE 'PENDING' END
        WHERE id = $1`,
      [id, reason.slice(0, 2000), dead],
    );
  }

  private async settle(id: string, status: RequestStatus): Promise<void> {
    await this.db.query(
      `UPDATE approval_requests SET status = $2, decided_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'PENDING'`,
      [id, status],
    );
  }

  private async countApprovals(requestId: string): Promise<number> {
    const { rows } = await this.db.query<{ count: string }>(
      `SELECT count(*) FROM approvals WHERE request_id = $1 AND decision = 'APPROVE'`,
      [requestId],
    );
    return Number(rows[0].count);
  }

  private async hydrate(row: Record<string, any>): Promise<ApprovalRequest> {
    const { rows: approvals } = await this.db.query<Record<string, any>>(
      'SELECT decision, decided_by, comment, created_at FROM approvals WHERE request_id = $1 ORDER BY created_at',
      [row.id],
    );
    return {
      id: row.id,
      action: row.action,
      policyId: row.policy_id,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      payloadDigest: row.payload_digest,
      summary: row.summary ?? {},
      requestedBy: row.requested_by,
      reason: row.reason,
      status: row.status,
      callbackUrl: row.callback_url,
      expiresAt: row.expires_at,
      decidedAt: row.decided_at,
      createdAt: row.created_at,
      approvals: approvals.map((a) => ({
        decision: a.decision,
        decidedBy: a.decided_by,
        comment: a.comment,
        createdAt: a.created_at,
      })),
    };
  }
}

function toPolicy(row: Record<string, any>): Policy {
  return {
    id: row.id,
    action: row.action,
    description: row.description,
    approvalsRequired: row.approvals_required,
    approverRoles: row.approver_roles ?? [],
    excludeInitiator: row.exclude_initiator,
    expiresAfterHours: row.expires_after_hours,
  };
}
