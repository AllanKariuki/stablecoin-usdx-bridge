import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Queryable } from '@damp/nest-platform';
import { DbService } from '../db/db.service';

@Injectable()
export class MembershipsRepository {
  constructor(private readonly db: DbService) {}

  /**
   * Grants `role` in an org, or does nothing if the party already holds a
   * membership there. Returns the new membership's id, or null when none was
   * created — a role grant is privilege, so the caller audits only a real one.
   */
  async ensure(partyId: string, orgId: string, role: string, q: Queryable = this.db): Promise<string | null> {
    const { rows } = await q.query(
      `INSERT INTO memberships (id, party_id, org_id, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (party_id, org_id) DO NOTHING
       RETURNING id`,
      [`mem_${randomUUID()}`, partyId, orgId, role],
    );
    return rows[0] ? String(rows[0].id) : null;
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
