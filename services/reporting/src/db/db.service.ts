import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { runMigrations } from './migration-runner';

/**
 * Owns reporting's Postgres pool and runs migrations at boot, before the
 * app starts accepting traffic — the Node equivalent of core-ledger's
 * NewRepository (core-ledger/internal/ledger/repository.go), which does
 * the same thing synchronously in Go via goose. NestJS awaits every
 * onModuleInit hook during app.init() (which app.listen() calls
 * implicitly), so migrations are guaranteed to finish before main.ts's
 * `await app.listen(port)` returns.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.pool = new Pool({ connectionString: this.config.get<string>('DATABASE_URL', { infer: true }) });

    // Resolves to services/reporting/migrations whether running compiled
    // (dist/db/db.service.js) or via ts-node (src/db/db.service.ts) — both
    // sit exactly two directories under services/reporting, and migrations/
    // is never copied into dist (matching core-ledger's own migrations/,
    // which stays under internal/ledger/ rather than being duplicated into
    // a build output).
    await runMigrations(this.pool, join(__dirname, '..', '..', 'migrations'));
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
    return this.pool.query<T>(text, params);
  }

  /**
   * Runs fn inside one transaction on one connection. The audit outbox needs
   * this: an audit event is only evidence if it commits or rolls back with
   * the change it describes, which means being written on the same client,
   * between the same BEGIN and COMMIT.
   */
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }
}
