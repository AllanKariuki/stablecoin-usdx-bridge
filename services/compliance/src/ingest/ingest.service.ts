import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';
import { Context, Movement, Rule, evaluate } from '../rules/engine';
import { ScreeningService } from '../screening/screening.service';

/**
 * Consuming `damp.ledger.transaction_posted.v1`.
 *
 * Every posting in the journal arrives here, in commit order, because the
 * event is written inside the same `SERIALIZABLE` transaction that wrote the
 * journal lines. There is no window in which money moved and compliance was
 * not told — which is the property the outbox was built for in P2, a phase
 * before anything consumed it.
 *
 * The consequence for this service is that it must be idempotent, because
 * at-least-once delivery means the same posting arrives more than once as a
 * matter of routine. The `UNIQUE (rule_id, transaction_id)` on alerts is
 * where that is enforced: a re-delivered event re-evaluates the rules and
 * inserts nothing new.
 */
@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  private readonly historyWindowMinutes: number;

  constructor(
    private readonly db: DbService,
    private readonly screening: ScreeningService,
    config: ConfigService,
  ) {
    this.historyWindowMinutes = config.get<number>('HISTORY_WINDOW_MINUTES', { infer: true }) ?? 1440;
  }

  async onTransactionPosted(payload: Record<string, any>): Promise<{ alerts: number }> {
    const movements = this.toMovements(payload);
    if (movements.length === 0) return { alerts: 0 };

    const rules = await this.activeRules();
    let alerts = 0;

    for (const movement of movements) {
      // Record first, evaluate second. A rule that looks at a party's recent
      // history needs this movement to be *in* that history for the next
      // one, and recording after evaluating would leave a gap exactly as
      // wide as the evaluation.
      await this.recordMovement(movement);

      const context = await this.contextFor(movement);
      const findings = evaluate(rules, movement, context);

      for (const finding of findings) {
        const created = await this.raiseAlert(movement, finding);
        if (created) alerts += 1;
      }
    }

    return { alerts };
  }

  /**
   * Turns a journal transaction into the movements compliance cares about.
   *
   * Only entries against a *customer wallet* (`2100.<CCY>.<walletID>`) count.
   * A transaction posts to several accounts — a deposit touches the
   * custodian's cash account too — and screening the platform's own reserve
   * account against a sanctions list on every deposit would be both useless
   * and expensive.
   */
  private toMovements(payload: Record<string, any>): Movement[] {
    const entries: Array<Record<string, any>> = payload.entries ?? [];
    const postedAt = payload.posted_at ? new Date(payload.posted_at) : new Date();

    return entries
      .filter((e) => typeof e.gl_code === 'string' && e.gl_code.startsWith('2100.'))
      .map((e) => ({
        transactionId: String(payload.transaction_id ?? ''),
        // The GL code's third segment is the wallet id. The party is resolved
        // from initiated_by, which the ledger stamps with the actor.
        partyId: String(payload.initiated_by ?? ''),
        type: String(payload.type ?? ''),
        amount: String(e.amount ?? '0'),
        currency: String(e.currency ?? 'USD'),
        counterparty: String(payload.external_ref ?? payload.entity_id ?? ''),
        postedAt,
      }))
      .filter((m) => m.transactionId !== '' && m.partyId !== '' && m.partyId !== 'api');
  }

  private async recordMovement(movement: Movement): Promise<void> {
    // A small local copy of what the ledger already knows, kept only so rules
    // can look back over a window without a cross-service query on every
    // posting. It is a cache of history, never a source of truth about value.
    await this.db.query(
      `INSERT INTO movements (transaction_id, party_id, type, amount, currency, counterparty, posted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (transaction_id, party_id, amount) DO NOTHING`,
      [
        movement.transactionId,
        movement.partyId,
        movement.type,
        movement.amount,
        movement.currency,
        movement.counterparty,
        movement.postedAt,
      ],
    );
  }

  private async contextFor(movement: Movement): Promise<Context> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT * FROM movements
        WHERE party_id = $1 AND transaction_id <> $2
          AND posted_at >= now() - make_interval(mins => $3)
        ORDER BY posted_at DESC LIMIT 500`,
      [movement.partyId, movement.transactionId, this.historyWindowMinutes],
    );

    const { rows: first } = await this.db.query<{ first_seen: Date | null }>(
      'SELECT min(posted_at) AS first_seen FROM movements WHERE party_id = $1',
      [movement.partyId],
    );

    // Screened only when there is something to screen. An internal transfer
    // between two DAMP wallets has no external counterparty, and screening
    // an empty string would cache a meaningless CLEAR under a meaningless
    // key.
    const counterpartyScreening = movement.counterparty
      ? await this.screening.screen('ADDRESS', movement.counterparty)
      : null;

    return {
      recent: rows.map((r) => ({
        transactionId: r.transaction_id,
        partyId: r.party_id,
        type: r.type,
        amount: r.amount,
        currency: r.currency,
        counterparty: r.counterparty,
        postedAt: r.posted_at,
      })),
      firstSeenAt: first[0]?.first_seen ?? null,
      counterpartyScreening: counterpartyScreening
        ? { outcome: counterpartyScreening.outcome, matches: counterpartyScreening.matches }
        : null,
      now: new Date(),
    };
  }

  /** Returns whether a new alert row was created (false on a re-delivery). */
  private async raiseAlert(movement: Movement, finding: { rule: Rule; detail: string; evidence: Record<string, unknown> }): Promise<boolean> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO alerts (id, rule_id, rule_name, party_id, transaction_id, subject, severity, detail, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (rule_id, transaction_id) DO NOTHING
       RETURNING id`,
      [
        `alt_${randomUUID()}`,
        finding.rule.id,
        finding.rule.name,
        movement.partyId,
        movement.transactionId,
        movement.counterparty,
        finding.rule.severity,
        finding.detail,
        JSON.stringify(finding.evidence),
      ],
    );

    if (rows.length === 0) return false;

    this.logger.warn(
      `alert: ${finding.rule.name} on ${movement.transactionId} (${movement.partyId}) — ${finding.detail}`,
    );

    // REVIEW and BLOCK open a case; FLAG records and moves on. The split is
    // what lets a rule run in observation mode before it can act on anybody.
    if (finding.rule.action !== 'FLAG') {
      await this.openOrAttachCase(movement, finding);
    }
    return true;
  }

  /**
   * One case per party, not one per alert.
   *
   * The same party tripping a velocity rule eleven times is one
   * investigation. Opening eleven cases would make the queue a measure of how
   * noisy the rules are rather than of how much work there is.
   */
  private async openOrAttachCase(movement: Movement, finding: { rule: Rule; detail: string }): Promise<void> {
    const { rows: open } = await this.db.query<{ id: string }>(
      `SELECT id FROM cases WHERE party_id = $1 AND status NOT LIKE 'CLOSED%' LIMIT 1`,
      [movement.partyId],
    );

    let caseId = open[0]?.id;
    if (!caseId) {
      caseId = `case_${randomUUID()}`;
      const reference = `CMP-${new Date().getUTCFullYear()}-${caseId.slice(-6).toUpperCase()}`;
      await this.db.query(
        `INSERT INTO cases (id, reference, party_id, severity, title, summary)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          caseId,
          reference,
          movement.partyId,
          finding.rule.severity,
          `${finding.rule.name} — ${movement.partyId}`,
          finding.detail,
        ],
      );
      this.logger.warn(`opened case ${reference} for ${movement.partyId}`);
    }

    await this.db.query(
      `UPDATE alerts SET case_id = $1, status = 'IN_CASE'
        WHERE rule_id = $2 AND transaction_id = $3`,
      [caseId, finding.rule.id, movement.transactionId],
    );

    // A case's severity only ever rises. A critical alert attaching to a
    // medium case must not leave the case looking medium in the queue.
    await this.db.query(
      `UPDATE cases SET severity = $2, updated_at = now()
        WHERE id = $1
          AND $3::int > (CASE severity WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 ELSE 4 END)`,
      [caseId, finding.rule.severity, severityRank(finding.rule.severity)],
    );
  }

  private async activeRules(): Promise<Rule[]> {
    const { rows } = await this.db.query<Record<string, any>>('SELECT * FROM risk_rules WHERE active');
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      params: r.params ?? {},
      severity: r.severity,
      action: r.action,
      active: r.active,
    }));
  }
}

function severityRank(severity: string): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity] ?? 2;
}
