import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';
import { CoreLedgerClient } from '../core-ledger/core-ledger.client';
import { StubKycProvider } from '../providers/kyc-provider';
import { TiersRepository } from '../tiers/tiers.repository';
import { WorkflowClient } from '../workflow/workflow.client';

export type CaseStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'SCREENING'
  | 'PENDING_REVIEW'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED';

export interface KycCase {
  id: string;
  partyId: string;
  requestedTier: string;
  status: CaseStatus;
  provider: string;
  providerRef: string;
  providerResult: Record<string, unknown>;
  riskScore: number | null;
  approvalRequestId: string;
  reviewedBy: string;
  reviewNotes: string;
  rejectionReason: string;
  submittedAt: Date | null;
  decidedAt: Date | null;
  createdAt: Date;
}

/**
 * The KYC lifecycle.
 *
 *   DRAFT → SUBMITTED → SCREENING → PENDING_REVIEW → PENDING_APPROVAL → APPROVED
 *                                        ↘ REJECTED (auto or by a reviewer)
 *
 * Two of those transitions are worth explaining, because a shorter path is
 * obviously available and wrong:
 *
 *  - **SCREENING → PENDING_REVIEW even on a CLEAR result.** It is tempting to
 *    auto-approve a clean screen. What stops it is that "clear" is a
 *    provider's opinion, approving a case grants a tier that can move money,
 *    and a provider misconfiguration would then silently onboard everyone.
 *    A CLEAR result *skips the queue* — it goes straight to PENDING_APPROVAL
 *    — but it still passes through maker-checker.
 *  - **PENDING_APPROVAL is not APPROVED.** The reviewer's decision opens a
 *    workflow request; the tier is granted only when that request comes back
 *    approved *and its payload digest still matches*. A reviewer who decides
 *    and a system that acts are deliberately two events.
 */
@Injectable()
export class CasesService {
  private readonly logger = new Logger(CasesService.name);

  constructor(
    private readonly db: DbService,
    private readonly tiers: TiersRepository,
    private readonly provider: StubKycProvider,
    private readonly workflow: WorkflowClient,
    private readonly ledger: CoreLedgerClient,
  ) {}

  async open(partyId: string, requestedTier: string): Promise<KycCase> {
    const tier = await this.tiers.byName(requestedTier);
    if (!tier) throw new BadRequestException(`no such tier: ${requestedTier}`);

    try {
      const { rows } = await this.db.query<Record<string, any>>(
        `INSERT INTO kyc_cases (id, party_id, requested_tier) VALUES ($1,$2,$3) RETURNING *`,
        [`kyc_${randomUUID()}`, partyId, requestedTier],
      );
      return toCase(rows[0]);
    } catch (err) {
      // The partial unique index on open cases. A second application while
      // one is in review would let two reviewers reach two different
      // decisions about one person.
      if ((err as { code?: string }).code === '23505') {
        const open = await this.openCaseFor(partyId);
        throw new ConflictException(
          `this party already has an open KYC case (${open?.id}, ${open?.status}). ` +
            `Resolve it before opening another.`,
        );
      }
      throw err;
    }
  }

  async addDocument(input: {
    caseId: string;
    partyId: string;
    kind: string;
    storageKey: string;
    contentType: string;
    sizeBytes: number;
    sha256: string;
  }): Promise<void> {
    const kycCase = await this.find(input.caseId);
    if (!kycCase || kycCase.partyId !== input.partyId) throw new NotFoundException('no such case');
    if (!['DRAFT', 'SUBMITTED', 'PENDING_REVIEW'].includes(kycCase.status)) {
      // Adding evidence to a decided case would mean the decision was made
      // on a different set of documents than the case now shows.
      throw new ConflictException(`documents cannot be added to a case that is ${kycCase.status}`);
    }

    await this.db.query(
      `INSERT INTO kyc_documents (id, case_id, party_id, kind, storage_key, content_type, size_bytes, sha256)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        `doc_${randomUUID()}`,
        input.caseId,
        input.partyId,
        input.kind,
        input.storageKey,
        input.contentType,
        input.sizeBytes,
        input.sha256,
      ],
    );
  }

  /**
   * Submits a case and screens it.
   *
   * Required documents are checked here rather than at upload time, because
   * "what is required" is a property of the tier being applied for and a
   * party can change which tier they are going for while drafting.
   */
  async submit(caseId: string, partyId: string, subject: { email: string; fullName: string; country: string }) {
    const kycCase = await this.find(caseId);
    if (!kycCase || kycCase.partyId !== partyId) throw new NotFoundException('no such case');
    if (kycCase.status !== 'DRAFT') throw new ConflictException(`this case is already ${kycCase.status}`);

    const tier = (await this.tiers.byName(kycCase.requestedTier))!;
    const documents = await this.documentsFor(caseId);
    const kinds = documents.map((d) => d.kind);

    const missing = tier.requiredDocuments.filter((required) => !kinds.includes(required));
    if (missing.length > 0) {
      throw new BadRequestException(`${tier.name} requires: ${missing.join(', ')}`);
    }

    await this.setStatus(caseId, 'SCREENING', { submitted_at: new Date() });

    const result = await this.provider.screen({
      partyId,
      email: subject.email,
      fullName: subject.fullName,
      country: subject.country,
      documentKinds: kinds,
    });

    await this.db.query(
      `UPDATE kyc_cases SET provider = $2, provider_ref = $3, provider_result = $4,
              risk_score = $5, updated_at = now()
        WHERE id = $1`,
      [caseId, this.provider.name, result.providerRef, JSON.stringify(result.raw), result.riskScore],
    );

    if (result.outcome === 'REJECT') {
      // Auto-decline. A sanctions match is not a judgement call, and routing
      // it to a human queue would mean a human clicking "reject" on something
      // nobody may lawfully onboard.
      await this.reject(caseId, 'system', result.reasons.join('; ') || 'Screening rejected');
      return this.find(caseId);
    }

    // CLEAR skips the human queue but not maker-checker. See the class
    // comment for why auto-approving a clean screen is the wrong shortcut.
    await this.setStatus(caseId, result.outcome === 'CLEAR' ? 'PENDING_APPROVAL' : 'PENDING_REVIEW');

    if (result.outcome === 'CLEAR') {
      await this.requestApproval(caseId, 'system', 'Screening returned CLEAR');
    }
    return this.find(caseId);
  }

  /** A compliance officer's decision. It proposes; it does not grant. */
  async review(caseId: string, reviewedBy: string, decision: 'APPROVE' | 'REJECT', notes: string) {
    const kycCase = await this.find(caseId);
    if (!kycCase) throw new NotFoundException('no such case');
    if (kycCase.status !== 'PENDING_REVIEW') {
      throw new ConflictException(`this case is ${kycCase.status}, not awaiting review`);
    }

    if (decision === 'REJECT') {
      await this.reject(caseId, reviewedBy, notes);
      return this.find(caseId);
    }

    await this.db.query(
      `UPDATE kyc_cases SET reviewed_by = $2, review_notes = $3, status = 'PENDING_APPROVAL', updated_at = now()
        WHERE id = $1`,
      [caseId, reviewedBy, notes],
    );
    await this.requestApproval(caseId, reviewedBy, notes);
    return this.find(caseId);
  }

  /**
   * Opens the maker-checker request that gates approval.
   *
   * The payload is what the approver is agreeing to — this party, this tier,
   * this screening result — and the digest over it is what makes the approval
   * mean something specific. If the case's requested tier were edited between
   * the reviewer deciding and the approver approving, the digest would no
   * longer match and `onApproved` refuses.
   */
  private async requestApproval(caseId: string, requestedBy: string, reason: string): Promise<void> {
    const kycCase = (await this.find(caseId))!;
    const payload = {
      caseId: kycCase.id,
      partyId: kycCase.partyId,
      tier: kycCase.requestedTier,
      riskScore: kycCase.riskScore,
      providerRef: kycCase.providerRef,
    };

    const request = await this.workflow.propose({
      action: 'kyc.approve',
      subjectType: 'KYC_CASE',
      subjectId: kycCase.id,
      payload,
      summary: {
        party: kycCase.partyId,
        tier: kycCase.requestedTier,
        riskScore: kycCase.riskScore,
        reviewer: kycCase.reviewedBy || 'system',
      },
      requestedBy,
      reason,
    });

    if (!request) {
      // workflow is unreachable. The case stays PENDING_APPROVAL rather than
      // being approved anyway — a KYC gate that opens when its approval
      // service is down is not a gate.
      this.logger.error(
        `could not open an approval request for ${caseId}; it stays PENDING_APPROVAL until workflow is reachable`,
      );
      return;
    }

    await this.db.query('UPDATE kyc_cases SET approval_request_id = $2, updated_at = now() WHERE id = $1', [
      caseId,
      request.id,
    ]);
  }

  /**
   * workflow's callback.
   *
   * The digest is re-computed over the case **as it stands now** and compared
   * to what was approved. This is the check that makes a compromised workflow
   * service harmless: it can send whatever it likes, and a payload that does
   * not match the case is refused.
   */
  async onApprovalDecision(input: {
    subjectId: string;
    payloadDigest: string;
    status: string;
  }): Promise<{ applied: boolean; reason?: string }> {
    const kycCase = await this.find(input.subjectId);
    if (!kycCase) return { applied: false, reason: 'no such case' };
    if (kycCase.status !== 'PENDING_APPROVAL') {
      return { applied: false, reason: `case is ${kycCase.status}` };
    }

    const expected = this.workflow.digest({
      caseId: kycCase.id,
      partyId: kycCase.partyId,
      tier: kycCase.requestedTier,
      riskScore: kycCase.riskScore,
      providerRef: kycCase.providerRef,
    });

    if (expected !== input.payloadDigest) {
      this.logger.error(
        `REFUSING an approval for ${kycCase.id}: the approved payload does not match this case. ` +
          `Either the case changed after approval, or the decision is not for what it claims.`,
      );
      return { applied: false, reason: 'payload digest mismatch' };
    }

    if (input.status !== 'APPROVED') {
      await this.reject(kycCase.id, 'workflow', `Approval ${input.status.toLowerCase()}`);
      return { applied: true };
    }

    await this.tiers.grant({
      partyId: kycCase.partyId,
      tier: kycCase.requestedTier,
      grantedBy: kycCase.reviewedBy || 'system',
      caseId: kycCase.id,
      reason: `KYC case ${kycCase.id} approved`,
    });
    await this.setStatus(kycCase.id, 'APPROVED', { decided_at: new Date() });

    // Unfreeze. The wallet was frozen at TIER_0 (or never created), and
    // core-ledger's existing status route is the mechanism — no second
    // freezing concept, so the ACCOUNT_FROZEN 409 every service already
    // handles keeps being the one signal.
    await this.ledger.setWalletsActive(kycCase.partyId);

    this.logger.log(`${kycCase.partyId} approved to ${kycCase.requestedTier} (case ${kycCase.id})`);
    return { applied: true };
  }

  async reject(caseId: string, by: string, reason: string): Promise<void> {
    await this.db.query(
      `UPDATE kyc_cases SET status = 'REJECTED', rejection_reason = $2, reviewed_by = $3,
              decided_at = now(), updated_at = now()
        WHERE id = $1 AND status NOT IN ('APPROVED', 'REJECTED')`,
      [caseId, reason, by],
    );
  }

  // --- Reading -------------------------------------------------------------

  async find(id: string): Promise<KycCase | null> {
    const { rows } = await this.db.query<Record<string, any>>('SELECT * FROM kyc_cases WHERE id = $1', [id]);
    return rows[0] ? toCase(rows[0]) : null;
  }

  async openCaseFor(partyId: string): Promise<KycCase | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT * FROM kyc_cases WHERE party_id = $1 AND status NOT IN ('APPROVED','REJECTED','EXPIRED')`,
      [partyId],
    );
    return rows[0] ? toCase(rows[0]) : null;
  }

  async casesFor(partyId: string): Promise<KycCase[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      'SELECT * FROM kyc_cases WHERE party_id = $1 ORDER BY created_at DESC',
      [partyId],
    );
    return rows.map(toCase);
  }

  async queue(): Promise<KycCase[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT * FROM kyc_cases WHERE status IN ('PENDING_REVIEW','SCREENING') ORDER BY submitted_at NULLS LAST`,
    );
    return rows.map(toCase);
  }

  async documentsFor(caseId: string) {
    const { rows } = await this.db.query<Record<string, any>>(
      'SELECT * FROM kyc_documents WHERE case_id = $1 ORDER BY uploaded_at',
      [caseId],
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      contentType: r.content_type,
      sizeBytes: Number(r.size_bytes),
      sha256: r.sha256,
      status: r.status,
      uploadedAt: r.uploaded_at,
    }));
  }

  private async setStatus(id: string, status: CaseStatus, extra: Record<string, unknown> = {}): Promise<void> {
    const sets = ['status = $2', 'updated_at = now()'];
    const params: unknown[] = [id, status];
    for (const [key, value] of Object.entries(extra)) {
      params.push(value);
      sets.push(`${key} = $${params.length}`);
    }
    await this.db.query(`UPDATE kyc_cases SET ${sets.join(', ')} WHERE id = $1`, params);
  }
}

function toCase(row: Record<string, any>): KycCase {
  return {
    id: row.id,
    partyId: row.party_id,
    requestedTier: row.requested_tier,
    status: row.status,
    provider: row.provider,
    providerRef: row.provider_ref,
    providerResult: row.provider_result ?? {},
    riskScore: row.risk_score,
    approvalRequestId: row.approval_request_id,
    reviewedBy: row.reviewed_by,
    reviewNotes: row.review_notes,
    rejectionReason: row.rejection_reason,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}
