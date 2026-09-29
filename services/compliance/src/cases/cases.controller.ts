import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CurrentUser } from '../auth/current-user.decorator';
import { DbService } from '../db/db.service';
import { EnforcementService } from '../enforcement/enforcement.service';
import { ScreeningService } from '../screening/screening.service';

/**
 * A compliance officer's working surface: the alert queue, the cases those
 * alerts roll up into, and the enforcement actions a case can lead to.
 */
@Controller()
export class CasesController {
  constructor(
    private readonly db: DbService,
    private readonly screening: ScreeningService,
    private readonly enforcement: EnforcementService,
  ) {}

  @Get('compliance/alerts')
  async alerts(@Query('status') status = 'OPEN') {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT * FROM alerts WHERE ($1 = 'ALL' OR status = $1) ORDER BY created_at DESC LIMIT 200`,
      [status],
    );
    return {
      alerts: rows.map((r) => ({
        id: r.id,
        rule: r.rule_name,
        severity: r.severity,
        partyId: r.party_id,
        transactionId: r.transaction_id,
        detail: r.detail,
        evidence: r.evidence,
        caseId: r.case_id,
        status: r.status,
        createdAt: r.created_at.toISOString(),
      })),
    };
  }

  @Post('compliance/alerts/:id/dismiss')
  @HttpCode(200)
  async dismissAlert(@CurrentUser() userId: string, @Param('id') id: string, @Body() body: { reason?: string }) {
    const { rows } = await this.db.query<{ id: string }>(
      `UPDATE alerts SET status = 'DISMISSED',
              evidence = evidence || jsonb_build_object('dismissedBy', $2::text, 'dismissReason', $3::text)
        WHERE id = $1 AND status = 'OPEN' RETURNING id`,
      [id, userId, body?.reason ?? ''],
    );
    if (!rows[0]) throw new NotFoundException('no such open alert');
    return { id, status: 'DISMISSED' };
  }

  @Get('compliance/cases')
  async cases(@Query('status') status?: string) {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT * FROM cases WHERE ($1::text IS NULL OR status = $1) ORDER BY created_at DESC LIMIT 200`,
      [status ?? null],
    );
    return { cases: rows.map(renderCase) };
  }

  @Get('compliance/cases/:id')
  async getCase(@Param('id') id: string) {
    const { rows } = await this.db.query<Record<string, any>>('SELECT * FROM cases WHERE id = $1', [id]);
    if (!rows[0]) throw new NotFoundException('no such case');

    const { rows: alerts } = await this.db.query<Record<string, any>>(
      'SELECT id, rule_name, severity, detail, transaction_id, created_at FROM alerts WHERE case_id = $1 ORDER BY created_at',
      [id],
    );
    const { rows: notes } = await this.db.query<Record<string, any>>(
      'SELECT author, note, created_at FROM case_notes WHERE case_id = $1 ORDER BY created_at',
      [id],
    );
    const { rows: actions } = await this.db.query<Record<string, any>>(
      'SELECT id, kind, target, status, reason, chain_tx_hash, created_at FROM enforcement_actions WHERE case_id = $1',
      [id],
    );

    return {
      ...renderCase(rows[0]),
      alerts: alerts.map((a) => ({
        id: a.id,
        rule: a.rule_name,
        severity: a.severity,
        detail: a.detail,
        transactionId: a.transaction_id,
        at: a.created_at.toISOString(),
      })),
      notes: notes.map((n) => ({ author: n.author, note: n.note, at: n.created_at.toISOString() })),
      enforcementActions: actions.map((a) => ({
        id: a.id,
        kind: a.kind,
        target: a.target,
        status: a.status,
        reason: a.reason,
        chainTxHash: a.chain_tx_hash || null,
        at: a.created_at.toISOString(),
      })),
    };
  }

  /** Append-only. A note is contemporaneous evidence of what was known when. */
  @Post('compliance/cases/:id/notes')
  async addNote(@CurrentUser() userId: string, @Param('id') id: string, @Body() body: { note: string }) {
    if (!body?.note?.trim()) throw new NotFoundException('a note cannot be empty');
    await this.db.query('INSERT INTO case_notes (id, case_id, author, note) VALUES ($1,$2,$3,$4)', [
      `note_${randomUUID()}`,
      id,
      userId,
      body.note,
    ]);
    return { added: true };
  }

  @Post('compliance/cases/:id/assign')
  @HttpCode(200)
  async assign(@Param('id') id: string, @Body() body: { assignee: string }) {
    await this.db.query(
      `UPDATE cases SET assigned_to = $2, status = 'INVESTIGATING', updated_at = now() WHERE id = $1`,
      [id, body.assignee],
    );
    return { id, assignedTo: body.assignee };
  }

  /**
   * Closing a case.
   *
   * Two outcomes, and they are not symmetric: CLOSED_CLEARED is an opinion,
   * CLOSED_SAR is a filing. A SAR requires a narrative, because the narrative
   * *is* the report and closing a case as "suspicious" with no account of why
   * is not a filing anybody can act on.
   */
  @Post('compliance/cases/:id/close')
  @HttpCode(200)
  async close(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: { outcome: 'CLEARED' | 'SAR'; notes?: string; sarNarrative?: string },
  ) {
    if (body?.outcome === 'SAR' && !body.sarNarrative?.trim()) {
      throw new NotFoundException('a SAR needs a narrative — the narrative is the report');
    }

    const { rows } = await this.db.query<Record<string, any>>(
      `UPDATE cases SET status = $2, closed_at = now(), closed_by = $3, closing_notes = $4,
              sar_narrative = $5, sar_filed_at = CASE WHEN $2 = 'CLOSED_SAR' THEN now() ELSE NULL END,
              updated_at = now()
        WHERE id = $1 AND status NOT LIKE 'CLOSED%'
        RETURNING *`,
      [
        id,
        body.outcome === 'SAR' ? 'CLOSED_SAR' : 'CLOSED_CLEARED',
        userId,
        body?.notes ?? '',
        body?.sarNarrative ?? '',
      ],
    );
    if (!rows[0]) throw new NotFoundException('no such open case');
    return renderCase(rows[0]);
  }

  /** The SAR as a filing-ready document, assembled from the case's evidence. */
  @Get('compliance/cases/:id/sar')
  async sar(@Param('id') id: string) {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT * FROM cases WHERE id = $1 AND status = 'CLOSED_SAR'`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('no filed SAR for this case');

    const { rows: alerts } = await this.db.query<Record<string, any>>(
      'SELECT rule_name, detail, evidence, transaction_id, created_at FROM alerts WHERE case_id = $1 ORDER BY created_at',
      [id],
    );

    return {
      reference: rows[0].reference,
      partyId: rows[0].party_id,
      filedAt: rows[0].sar_filed_at?.toISOString() ?? null,
      filedBy: rows[0].closed_by,
      // Verbatim. A filed report is a legal document; regenerating the
      // narrative from current data would produce a different document each
      // time it was exported.
      narrative: rows[0].sar_narrative,
      supportingActivity: alerts.map((a) => ({
        rule: a.rule_name,
        detail: a.detail,
        transactionId: a.transaction_id,
        evidence: a.evidence,
        at: a.created_at.toISOString(),
      })),
    };
  }

  @Post('compliance/screenings')
  @HttpCode(200)
  async screen(@Body() body: { subjectType: 'PARTY' | 'ADDRESS' | 'BANK_ACCOUNT'; subject: string }) {
    return this.screening.screen(body.subjectType, body.subject);
  }

  // --- Enforcement ---------------------------------------------------------

  /**
   * Proposes an on-chain or ledger enforcement action.
   *
   * It only ever *proposes*. Blacklisting freezes somebody's tokens and
   * pausing halts every transfer on the chain, so both go through
   * maker-checker before anything is submitted — and the seeded policy for
   * `compliance.pause` needs two approvals.
   */
  @Post('compliance/enforcement')
  async propose(
    @CurrentUser() userId: string,
    @Body()
    body: {
      kind: 'BLACKLIST' | 'UNBLACKLIST' | 'PAUSE' | 'UNPAUSE' | 'FREEZE_WALLET' | 'UNFREEZE_WALLET';
      chain?: string;
      target?: string;
      partyId?: string;
      caseId?: string;
      reason: string;
    },
  ) {
    return this.enforcement.propose({ ...body, requestedBy: userId });
  }

  @Get('compliance/enforcement')
  async listEnforcement() {
    const { rows } = await this.db.query<Record<string, any>>(
      'SELECT * FROM enforcement_actions ORDER BY created_at DESC LIMIT 100',
    );
    return {
      actions: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        chain: r.chain,
        target: r.target,
        partyId: r.party_id,
        status: r.status,
        reason: r.reason,
        requestedBy: r.requested_by,
        approvalRequestId: r.approval_request_id || null,
        chainTxHash: r.chain_tx_hash || null,
        failureReason: r.failure_reason,
        createdAt: r.created_at.toISOString(),
        executedAt: r.executed_at?.toISOString() ?? null,
      })),
    };
  }
}

function renderCase(row: Record<string, any>) {
  return {
    id: row.id,
    reference: row.reference,
    partyId: row.party_id,
    status: row.status,
    severity: row.severity,
    title: row.title,
    summary: row.summary,
    assignedTo: row.assigned_to || null,
    closedAt: row.closed_at?.toISOString() ?? null,
    closedBy: row.closed_by || null,
    createdAt: row.created_at.toISOString(),
  };
}
