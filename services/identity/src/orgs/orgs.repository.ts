import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';
import { Org } from './org.types';

interface OrgRow {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  created_at: Date;
}

@Injectable()
export class OrgsRepository {
  constructor(private readonly db: DbService) {}

  async findById(id: string): Promise<Org | null> {
    const { rows } = await this.db.query<OrgRow>('SELECT * FROM orgs WHERE id = $1', [id]);
    return rows[0] ? toOrg(rows[0]) : null;
  }

  /**
   * ensure upserts by the Keycloak-supplied org_id so two concurrent
   * first-logins from the same org race safely — ON CONFLICT DO UPDATE
   * always returns a row (a bare DO NOTHING would silently return nothing
   * to the losing side, which then has no org id to build a membership
   * against).
   */
  async ensure(input: { orgId: string; slug: string; name: string }): Promise<Org> {
    const id = `org_${randomUUID()}`;
    const { rows } = await this.db.query<OrgRow>(
      `INSERT INTO orgs (id, org_id, slug, name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (org_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [id, input.orgId, input.slug, input.name],
    );
    return toOrg(rows[0]);
  }
}

function toOrg(row: OrgRow): Org {
  return { id: row.id, orgId: row.org_id, slug: row.slug, name: row.name, createdAt: row.created_at };
}
