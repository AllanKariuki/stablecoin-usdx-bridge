import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';

@Injectable()
export class MembershipsRepository {
  constructor(private readonly db: DbService) {}

  async ensure(partyId: string, orgId: string, role: string): Promise<void> {
    await this.db.query(
      `INSERT INTO memberships (id, party_id, org_id, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (party_id, org_id) DO NOTHING`,
      [`mem_${randomUUID()}`, partyId, orgId, role],
    );
  }

  /**
   * A party belongs to at most one org in every flow this service builds
   * today (JIT provisioning creates exactly one membership on first
   * login), so "primary" just means "earliest" — this is a seam for a
   * future multi-org party (e.g. an accountant with access to more than one
   * company), not a real ordering decision yet.
   */
  async primaryOrgIdFor(partyId: string): Promise<string | null> {
    const { rows } = await this.db.query<{ org_id: string }>(
      'SELECT org_id FROM memberships WHERE party_id = $1 ORDER BY created_at ASC LIMIT 1',
      [partyId],
    );
    return rows[0]?.org_id ?? null;
  }
}
