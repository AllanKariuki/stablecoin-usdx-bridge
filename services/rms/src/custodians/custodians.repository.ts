import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';

export interface Custodian {
  id: string;
  name: string;
  currency: string;
  provider: string;
  accountRef: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  config: Record<string, unknown>;
}

export interface CustodianStatement {
  id: string;
  custodianId: string;
  currency: string;
  balance: string;
  asOf: Date;
  statementRef: string;
  source: string;
  postedAt: Date | null;
  postAttempts: number;
  lastError: string;
}

interface CustodianRow {
  id: string;
  name: string;
  currency: string;
  provider: string;
  account_ref: string;
  status: Custodian['status'];
  config: Record<string, unknown>;
}

interface StatementRow {
  id: string;
  custodian_id: string;
  currency: string;
  balance: string;
  as_of: Date;
  statement_ref: string;
  source: string;
  posted_at: Date | null;
  post_attempts: number;
  last_error: string;
}

@Injectable()
export class CustodiansRepository {
  constructor(private readonly db: DbService) {}

  async list(): Promise<Custodian[]> {
    const { rows } = await this.db.query<CustodianRow>('SELECT * FROM custodians ORDER BY id');
    return rows.map(toCustodian);
  }

  async active(): Promise<Custodian[]> {
    const { rows } = await this.db.query<CustodianRow>(
      `SELECT * FROM custodians WHERE status = 'ACTIVE' ORDER BY id`,
    );
    return rows.map(toCustodian);
  }

  async find(id: string): Promise<Custodian | null> {
    const { rows } = await this.db.query<CustodianRow>('SELECT * FROM custodians WHERE id = $1', [id]);
    return rows[0] ? toCustodian(rows[0]) : null;
  }

  async upsert(input: Omit<Custodian, 'status'> & { status?: Custodian['status'] }): Promise<Custodian> {
    const { rows } = await this.db.query<CustodianRow>(
      `INSERT INTO custodians (id, name, currency, provider, account_ref, status, config)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'ACTIVE'), $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, currency = EXCLUDED.currency, provider = EXCLUDED.provider,
         account_ref = EXCLUDED.account_ref, status = EXCLUDED.status,
         config = EXCLUDED.config, updated_at = now()
       RETURNING *`,
      [input.id, input.name, input.currency, input.provider, input.accountRef, input.status ?? null, input.config],
    );
    return toCustodian(rows[0]);
  }

  /**
   * setDrift is what makes the DoD demonstrable: "post a custodian snapshot
   * $1,000 short and watch a LEG_C alert appear within one interval". It
   * merges into config rather than replacing it, so a provider's other
   * settings survive a demo.
   */
  async setDrift(id: string, drift: string): Promise<Custodian | null> {
    const { rows } = await this.db.query<CustodianRow>(
      `UPDATE custodians
          SET config = config || jsonb_build_object('drift', $2::text), updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [id, drift],
    );
    return rows[0] ? toCustodian(rows[0]) : null;
  }

  /**
   * recordStatement writes what a custodian said *before* anything tries to
   * tell core-ledger about it. That order is the durability: a poller that
   * dies between reading a balance and posting it retries rather than
   * skipping, and a skipped custodian snapshot is not a visible failure —
   * it is a Leg C that quietly compares against yesterday and passes.
   *
   * Conflicting on (custodian, currency, as_of) makes a re-read of the same
   * statement a no-op rather than a second row at the same moment.
   */
  async recordStatement(input: {
    custodianId: string;
    currency: string;
    balance: string;
    asOf: Date;
    statementRef: string;
    source: string;
  }): Promise<CustodianStatement> {
    const { rows } = await this.db.query<StatementRow>(
      `INSERT INTO custodian_statements (id, custodian_id, currency, balance, as_of, statement_ref, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (custodian_id, currency, as_of) DO UPDATE SET
         balance = EXCLUDED.balance, statement_ref = EXCLUDED.statement_ref, source = EXCLUDED.source
       RETURNING *`,
      [
        `stmt_${randomUUID()}`,
        input.custodianId,
        input.currency,
        input.balance,
        input.asOf,
        input.statementRef,
        input.source,
      ],
    );
    return toStatement(rows[0]);
  }

  async unposted(limit = 20): Promise<CustodianStatement[]> {
    const { rows } = await this.db.query<StatementRow>(
      `SELECT * FROM custodian_statements WHERE posted_at IS NULL ORDER BY as_of LIMIT $1`,
      [limit],
    );
    return rows.map(toStatement);
  }

  async markPosted(id: string): Promise<void> {
    await this.db.query(`UPDATE custodian_statements SET posted_at = now(), last_error = '' WHERE id = $1`, [id]);
  }

  async markFailed(id: string, cause: string): Promise<void> {
    await this.db.query(
      `UPDATE custodian_statements SET post_attempts = post_attempts + 1, last_error = $2 WHERE id = $1`,
      [id, cause.slice(0, 2000)],
    );
  }

  async statements(custodianId: string, limit = 50): Promise<CustodianStatement[]> {
    const { rows } = await this.db.query<StatementRow>(
      `SELECT * FROM custodian_statements WHERE custodian_id = $1 ORDER BY as_of DESC LIMIT $2`,
      [custodianId, limit],
    );
    return rows.map(toStatement);
  }
}

function toCustodian(row: CustodianRow): Custodian {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    provider: row.provider,
    accountRef: row.account_ref,
    status: row.status,
    config: row.config ?? {},
  };
}

function toStatement(row: StatementRow): CustodianStatement {
  return {
    id: row.id,
    custodianId: row.custodian_id,
    currency: row.currency,
    balance: row.balance,
    asOf: row.as_of,
    statementRef: row.statement_ref,
    source: row.source,
    postedAt: row.posted_at,
    postAttempts: row.post_attempts,
    lastError: row.last_error,
  };
}
