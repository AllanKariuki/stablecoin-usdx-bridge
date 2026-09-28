import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CoreLedgerClient } from '../core-ledger/core-ledger.client';
import { DbService } from '../db/db.service';
import { toMoney } from '../money/money';

interface AttestationRow {
  id: string;
  as_of: Date;
  currency: string;
  issued: string;
  backing: string;
  custodian_total: string;
  chain_supply: Record<string, unknown>;
  reconciliation_run_id: string;
  status: 'DRAFT' | 'PUBLISHED';
  published_at: Date | null;
  prepared_by: string;
}

/**
 * An attestation is the published claim: as of this moment, N USD-X were in
 * circulation and $M were held against them.
 *
 * It is a frozen copy of core-ledger's own numbers, not a live view — the
 * entire point of an attestation is that it does not change when the
 * underlying does. It also carries the reconciliation run id it was taken
 * against, so the claim and the evidence that the claim was checked are one
 * record rather than two things somebody has to correlate by timestamp.
 */
@Controller('attestations')
export class AttestationsController {
  constructor(
    private readonly db: DbService,
    private readonly ledger: CoreLedgerClient,
  ) {}

  @Get()
  async list() {
    const { rows } = await this.db.query<AttestationRow>(
      'SELECT * FROM attestations ORDER BY as_of DESC LIMIT 100',
    );
    return { attestations: rows.map(render) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const { rows } = await this.db.query<AttestationRow>('SELECT * FROM attestations WHERE id = $1', [id]);
    if (!rows[0]) throw new NotFoundException(`no attestation ${id}`);
    return render(rows[0]);
  }

  /**
   * Takes a snapshot. It is refused when reconciliation has an open break,
   * unless the caller says so explicitly — publishing "our reserves are
   * fine" while a control says they are not is the one thing an attestation
   * must never be able to do by accident.
   */
  @Post()
  async create(@Body() body: { preparedBy?: string; acknowledgeBreaks?: boolean }) {
    const status = await this.ledger.reserveStatus();

    if (status.open_breaks.length > 0 && !body?.acknowledgeBreaks) {
      throw new NotFoundException(
        `refusing to attest with ${status.open_breaks.length} open reconciliation break(s): ` +
          status.open_breaks.map((b) => `${b.leg}/${b.code}`).join(', ') +
          '. Resolve them, or repeat with acknowledgeBreaks: true to attest anyway (the breaks are recorded on the attestation).',
      );
    }

    const { rows } = await this.db.query<AttestationRow>(
      `INSERT INTO attestations
         (id, as_of, currency, issued, backing, custodian_total, chain_supply, reconciliation_run_id, prepared_by)
       VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        `att_${randomUUID()}`,
        status.currency,
        status.issued,
        status.backing,
        status.custodian?.balance ?? '0',
        JSON.stringify({ chains: status.chains, openBreaks: status.open_breaks }),
        status.last_run?.id ?? '',
        body?.preparedBy ?? 'rms',
      ],
    );
    return render(rows[0]);
  }

  @Post(':id/publish')
  async publish(@Param('id') id: string) {
    const { rows } = await this.db.query<AttestationRow>(
      `UPDATE attestations SET status = 'PUBLISHED', published_at = now()
        WHERE id = $1 AND status = 'DRAFT'
        RETURNING *`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException(`no draft attestation ${id}`);
    return render(rows[0]);
  }
}

function render(row: AttestationRow) {
  return {
    id: row.id,
    asOf: row.as_of.toISOString(),
    currency: row.currency,
    issued: toMoney(row.issued, 'USDX'),
    backing: toMoney(row.backing, row.currency),
    custodianTotal: toMoney(row.custodian_total, row.currency),
    chainSupply: row.chain_supply,
    reconciliationRunId: row.reconciliation_run_id,
    status: row.status,
    publishedAt: row.published_at?.toISOString() ?? null,
    preparedBy: row.prepared_by,
  };
}
