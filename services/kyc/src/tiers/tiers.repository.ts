import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';

export interface Tier {
  name: string;
  rank: number;
  description: string;
  currency: string;
  dailyLimit: string;
  monthlyLimit: string;
  singleTxLimit: string;
  canDeposit: boolean;
  canWithdraw: boolean;
  canIssue: boolean;
  canBridge: boolean;
  requiredDocuments: string[];
}

@Injectable()
export class TiersRepository {
  constructor(private readonly db: DbService) {}

  async all(): Promise<Tier[]> {
    const { rows } = await this.db.query<Record<string, any>>('SELECT * FROM kyc_tiers ORDER BY rank');
    return rows.map(toTier);
  }

  async byName(name: string): Promise<Tier | null> {
    const { rows } = await this.db.query<Record<string, any>>('SELECT * FROM kyc_tiers WHERE name = $1', [name]);
    return rows[0] ? toTier(rows[0]) : null;
  }

  /**
   * A party's current tier, defaulting to TIER_0.
   *
   * The default is the gate. A party nobody has ever screened has no row
   * here, and TIER_0 can do nothing — which is what makes the plan's DoD
   * ("only then can deposit") true by construction rather than by every
   * caller remembering to check.
   */
  async tierFor(partyId: string): Promise<Tier> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT t.* FROM party_tiers p JOIN kyc_tiers t ON t.name = p.tier
        WHERE p.party_id = $1 AND (p.expires_at IS NULL OR p.expires_at > now())`,
      [partyId],
    );
    if (rows[0]) return toTier(rows[0]);
    return (await this.byName('TIER_0'))!;
  }

  /**
   * Grants a tier and records the change.
   *
   * Both writes, always — `tier_history` is not a nice-to-have. An auditor's
   * question is never "what tier are they" but "what tier were they on the
   * day of that transaction", and only the history answers it.
   */
  async grant(input: {
    partyId: string;
    tier: string;
    grantedBy: string;
    caseId?: string;
    reason: string;
    expiresAt?: Date | null;
  }): Promise<void> {
    const current = await this.db.query<{ tier: string }>('SELECT tier FROM party_tiers WHERE party_id = $1', [
      input.partyId,
    ]);

    await this.db.query(
      `INSERT INTO party_tiers (party_id, tier, granted_by, case_id, expires_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (party_id) DO UPDATE SET
         tier = EXCLUDED.tier, granted_by = EXCLUDED.granted_by,
         case_id = EXCLUDED.case_id, expires_at = EXCLUDED.expires_at,
         granted_at = now(), updated_at = now()`,
      [input.partyId, input.tier, input.grantedBy, input.caseId ?? null, input.expiresAt ?? null],
    );

    await this.db.query(
      `INSERT INTO tier_history (id, party_id, from_tier, to_tier, reason, changed_by, case_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        `th_${randomUUID()}`,
        input.partyId,
        current.rows[0]?.tier ?? '',
        input.tier,
        input.reason,
        input.grantedBy,
        input.caseId ?? null,
      ],
    );
  }

  async history(partyId: string) {
    const { rows } = await this.db.query<Record<string, any>>(
      'SELECT * FROM tier_history WHERE party_id = $1 ORDER BY created_at DESC LIMIT 100',
      [partyId],
    );
    return rows.map((r) => ({
      fromTier: r.from_tier,
      toTier: r.to_tier,
      reason: r.reason,
      changedBy: r.changed_by,
      at: r.created_at.toISOString(),
    }));
  }
}

function toTier(row: Record<string, any>): Tier {
  return {
    name: row.name,
    rank: row.rank,
    description: row.description,
    currency: row.currency,
    dailyLimit: row.daily_limit,
    monthlyLimit: row.monthly_limit,
    singleTxLimit: row.single_tx_limit,
    canDeposit: row.can_deposit,
    canWithdraw: row.can_withdraw,
    canIssue: row.can_issue,
    canBridge: row.can_bridge,
    requiredDocuments: row.required_documents ?? [],
  };
}
