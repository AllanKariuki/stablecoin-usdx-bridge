import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';

export type ReportKind =
  | 'TRIAL_BALANCE'
  | 'WALLET_STATEMENT'
  | 'RECONCILIATION_PACK'
  | 'RESERVE_ATTESTATION'
  | 'TRANSACTION_REGISTER'
  | 'AUDIT_EXTRACT';

export interface ReportDefinition {
  id: string;
  name: string;
  kind: ReportKind;
  description: string;
  params: Record<string, unknown>;
  requiredPermission: string;
}

export interface ReportRun {
  id: string;
  definitionId: string;
  kind: ReportKind;
  params: Record<string, unknown>;
  requestedBy: string;
  status: 'RUNNING' | 'COMPLETE' | 'FAILED';
  result: { columns: string[]; rows: Array<Record<string, unknown>>; summary?: Record<string, unknown> } | null;
  rowCount: number;
  error: string;
  resultHash: string;
  startedAt: Date;
  finishedAt: Date | null;
}

/**
 * Running a report.
 *
 * This service owns **no numbers**. Every figure is read from the service
 * that owns it at the moment the run executes, and frozen into the run's
 * row. That freezing is the reason a run is a row at all: a trial balance
 * regenerated on demand gives a different answer every time somebody opens
 * it, which is useless as a record — "the trial balance we filed on the 3rd"
 * has to still say what it said on the 3rd.
 *
 * There is also no query interface. A reporting service that runs arbitrary
 * SQL against other services' databases is a reporting service that has
 * bypassed every boundary this platform has, so the report kinds are a fixed
 * vocabulary and each one is a named HTTP call.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly coreLedgerUrl: string;
  private readonly auditTrailUrl: string;

  constructor(
    private readonly db: DbService,
    config: ConfigService,
  ) {
    this.coreLedgerUrl = config.get<string>('CORE_LEDGER_URL', { infer: true })!;
    this.auditTrailUrl = config.get<string>('AUDIT_TRAIL_URL', { infer: true }) ?? '';
  }

  async definitions(): Promise<ReportDefinition[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      'SELECT * FROM report_definitions ORDER BY name',
    );
    return rows.map(toDefinition);
  }

  async definition(id: string): Promise<ReportDefinition | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      'SELECT * FROM report_definitions WHERE id = $1 OR name = $1',
      [id],
    );
    return rows[0] ? toDefinition(rows[0]) : null;
  }

  async run(definitionId: string, params: Record<string, unknown>, requestedBy: string): Promise<ReportRun> {
    const definition = await this.definition(definitionId);
    if (!definition) throw new NotFoundException(`no report definition ${definitionId}`);

    const merged = { ...definition.params, ...params };
    const runId = `run_${randomUUID()}`;

    // The run row is written before the work, so a crash mid-report leaves a
    // RUNNING row somebody can see rather than no trace of an attempt.
    await this.db.query(
      `INSERT INTO report_runs (id, definition_id, kind, params, requested_by) VALUES ($1,$2,$3,$4,$5)`,
      [runId, definition.id, definition.kind, JSON.stringify(merged), requestedBy],
    );

    try {
      const result = await this.execute(definition.kind, merged);
      // Hashed over a canonical encoding, so a downloaded CSV can be proved
      // to match the run it claims to come from.
      const hash = createHash('sha256').update(JSON.stringify(result)).digest('hex');

      await this.db.query(
        `UPDATE report_runs SET status = 'COMPLETE', result = $2, row_count = $3,
                result_hash = $4, finished_at = now() WHERE id = $1`,
        [runId, JSON.stringify(result), result.rows.length, `sha256:${hash}`],
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.db.query(
        `UPDATE report_runs SET status = 'FAILED', error = $2, finished_at = now() WHERE id = $1`,
        [runId, message.slice(0, 2000)],
      );
      this.logger.error(`report ${definition.name} failed: ${message}`);
    }

    return (await this.findRun(runId))!;
  }

  async findRun(id: string): Promise<ReportRun | null> {
    const { rows } = await this.db.query<Record<string, any>>('SELECT * FROM report_runs WHERE id = $1', [id]);
    return rows[0] ? toRun(rows[0]) : null;
  }

  async runs(limit = 50): Promise<ReportRun[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      'SELECT * FROM report_runs ORDER BY started_at DESC LIMIT $1',
      [limit],
    );
    return rows.map(toRun);
  }

  // --- The reports themselves ---------------------------------------------

  private async execute(kind: ReportKind, params: Record<string, unknown>) {
    switch (kind) {
      case 'TRIAL_BALANCE':
        return this.trialBalance(params);
      case 'WALLET_STATEMENT':
        return this.walletStatement(params);
      case 'RECONCILIATION_PACK':
        return this.reconciliationPack(params);
      case 'RESERVE_ATTESTATION':
        return this.reserveAttestation();
      case 'TRANSACTION_REGISTER':
        return this.transactionRegister(params);
      case 'AUDIT_EXTRACT':
        return this.auditExtract(params);
      default:
        throw new BadRequestException(`unknown report kind ${kind}`);
    }
  }

  private async trialBalance(params: Record<string, unknown>) {
    const currency = String(params.currency ?? 'USD');
    const body = await this.getJson(`${this.coreLedgerUrl}/ledger/trial-balance?currency=${currency}`);
    return {
      columns: ['gl_code', 'name', 'type', 'debits', 'credits', 'balance'],
      rows: (body.lines as Array<Record<string, unknown>>) ?? [],
      summary: {
        currency: body.currency,
        asOf: body.as_of,
        // Surfaced rather than buried in the rows: a trial balance whose
        // debits and credits disagree is the one fact a reader needs before
        // anything else on the page.
        balanced: body.balanced,
        totalDebits: body.total_debits,
        totalCredits: body.total_credits,
      },
    };
  }

  private async walletStatement(params: Record<string, unknown>) {
    const walletId = String(params.walletId ?? '');
    if (!walletId) throw new BadRequestException('walletId is required');

    const query = new URLSearchParams();
    if (params.from) query.set('from', String(params.from));
    if (params.to) query.set('to', String(params.to));
    query.set('limit', String(params.limit ?? 500));

    const body = await this.getJson(`${this.coreLedgerUrl}/wallets/${walletId}/statement?${query}`);
    return {
      columns: ['seq', 'value_date', 'transaction_id', 'direction', 'amount', 'running_balance', 'description'],
      rows: (body.entries as Array<Record<string, unknown>>) ?? [],
      summary: { walletId: body.wallet_id, currency: body.currency },
    };
  }

  private async reconciliationPack(params: Record<string, unknown>) {
    const limit = Number(params.limit ?? 50);
    const runs = await this.getJson(`${this.coreLedgerUrl}/reserves/reconciliation-runs?limit=${limit}`);
    const breaks = await this.getJson(`${this.coreLedgerUrl}/reserves/reconciliation-breaks`);

    return {
      columns: ['id', 'status', 'started_at', 'leg_a_ok', 'leg_b_ok', 'leg_c_ok', 'break_count', 'issued', 'backing'],
      rows: (runs.runs as Array<Record<string, unknown>>) ?? [],
      summary: {
        // The pack's point: a regulator asks "were you balanced, and when
        // were you not", and both halves are needed to answer.
        openBreaks: breaks.breaks ?? [],
        runsIncluded: (runs.runs as unknown[])?.length ?? 0,
      },
    };
  }

  private async reserveAttestation() {
    const status = await this.getJson(`${this.coreLedgerUrl}/reserves/status`);
    return {
      columns: ['metric', 'value'],
      rows: [
        { metric: 'USD-X in circulation', value: status.issued },
        { metric: 'In transit between chains', value: status.in_transit },
        { metric: 'Reserve backing', value: status.backing },
        { metric: 'Cash at custodian (ledger)', value: status.ledger_cash },
        { metric: 'Cash at custodian (reported)', value: status.custodian?.balance ?? 'not reported' },
      ],
      summary: {
        currency: status.currency,
        chains: status.chains,
        // An attestation that omitted its open breaks would be a statement
        // that the reserves are fine, issued while a control says they are
        // not.
        openBreaks: status.open_breaks,
        lastReconciliation: status.last_run,
        asOf: new Date().toISOString(),
      },
    };
  }

  private async transactionRegister(params: Record<string, unknown>) {
    const query = new URLSearchParams({ limit: String(params.limit ?? 200) });
    if (params.userId) query.set('user_id', String(params.userId));

    const body = await this.getJson(`${this.coreLedgerUrl}/transactions?${query}`);
    const rows = ((body.transactions as Array<Record<string, any>>) ?? []).map((tx) => ({
      id: tx.id,
      type: tx.type,
      status: tx.status,
      value_date: tx.value_date,
      description: tx.description,
      external_ref: tx.external_ref,
      reversed: tx.reversed,
      created_at: tx.created_at,
    }));
    return {
      columns: ['id', 'type', 'status', 'value_date', 'description', 'external_ref', 'reversed', 'created_at'],
      rows,
      summary: { nextCursor: body.next_cursor || null },
    };
  }

  private async auditExtract(params: Record<string, unknown>) {
    if (!this.auditTrailUrl) {
      throw new BadRequestException('AUDIT_TRAIL_URL is not configured in this environment');
    }
    const query = new URLSearchParams({ limit: String(params.limit ?? 200) });
    for (const key of ['actor', 'action', 'subject_type', 'subject_id']) {
      if (params[key]) query.set(key, String(params[key]));
    }

    const body = await this.getJson(`${this.auditTrailUrl}/audit/events?${query}`);
    const rows = ((body.events as Array<Record<string, any>>) ?? []).map((e) => ({
      occurred_at: e.occurred_at,
      actor: e.actor,
      action: e.action,
      subject: `${e.subject_type}/${e.subject_id}`,
      outcome: e.outcome,
      service: e.service,
      // The hash and the anchor travel with the extract, so a row pasted into
      // a report can still be traced back and proved.
      hash: e.hash,
      anchor_id: e.anchor_id,
    }));
    return {
      columns: ['occurred_at', 'actor', 'action', 'subject', 'outcome', 'service', 'hash', 'anchor_id'],
      rows,
    };
  }

  private async getJson(url: string): Promise<Record<string, any>> {
    const res = await fetch(url, { headers: { 'X-User-Id': 'reporting' } });
    if (!res.ok) {
      throw new Error(`${url} returned ${res.status}`);
    }
    return (await res.json()) as Record<string, any>;
  }
}

function toDefinition(row: Record<string, any>): ReportDefinition {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    description: row.description,
    params: row.params ?? {},
    requiredPermission: row.required_permission,
  };
}

function toRun(row: Record<string, any>): ReportRun {
  return {
    id: row.id,
    definitionId: row.definition_id,
    kind: row.kind,
    params: row.params ?? {},
    requestedBy: row.requested_by,
    status: row.status,
    result: row.result,
    rowCount: row.row_count,
    error: row.error,
    resultHash: row.result_hash,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}
