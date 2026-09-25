import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';
import { Party, PartyType } from './party.types';

interface PartyRow {
  id: string;
  keycloak_subject: string;
  type: PartyType;
  email: string | null;
  display_name: string | null;
  created_at: Date;
}

@Injectable()
export class PartiesRepository {
  constructor(private readonly db: DbService) {}

  async findBySubject(subject: string): Promise<Party | null> {
    const { rows } = await this.db.query<PartyRow>('SELECT * FROM parties WHERE keycloak_subject = $1', [subject]);
    return rows[0] ? toParty(rows[0]) : null;
  }

  async findById(id: string): Promise<Party | null> {
    const { rows } = await this.db.query<PartyRow>('SELECT * FROM parties WHERE id = $1', [id]);
    return rows[0] ? toParty(rows[0]) : null;
  }

  /**
   * insert assumes the caller already checked findBySubject and found
   * nothing — keycloak_subject's UNIQUE constraint is the real guarantee
   * against a lost-update race between two concurrent first-logins for the
   * same subject, surfaced here as a Postgres unique violation (23505) the
   * caller (ProvisioningService) re-resolves by re-reading, not by
   * retrying this insert.
   */
  async insert(input: {
    keycloakSubject: string;
    type: PartyType;
    email: string | null;
    displayName: string | null;
  }): Promise<Party> {
    const id = `party_${randomUUID()}`;
    const { rows } = await this.db.query<PartyRow>(
      `INSERT INTO parties (id, keycloak_subject, type, email, display_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, input.keycloakSubject, input.type, input.email, input.displayName],
    );
    return toParty(rows[0]);
  }
}

function toParty(row: PartyRow): Party {
  return {
    id: row.id,
    keycloakSubject: row.keycloak_subject,
    type: row.type,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}
