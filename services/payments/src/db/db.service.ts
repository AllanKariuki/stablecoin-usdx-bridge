import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { Pool, QueryResultRow } from 'pg';
import { runMigrations } from './migration-runner';

/**
 * Anything a repository can run a statement against: the pool itself, or the
 * one client a transaction is pinned to. Repositories that take one of these
 * as an optional last argument can join a caller's transaction without
 * knowing it exists.
 */
export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Owns payments's Postgres pool and runs migrations at boot, before the
 * app starts accepting traffic — the Node equivalent of core-ledger's
 * NewRepository (core-ledger/internal/ledger/repository.go), which does
 * the same thing synchronously in Go via goose. NestJS awaits every
 * onModuleInit hook during app.init() (which app.listen() calls
 * implicitly), so migrations are guaranteed to finish before main.ts's
 * `await app.listen(port)` returns.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy, Queryable {
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.pool = new Pool({ connectionString: this.config.get<string>('DATABASE_URL', { infer: true }) });

    // Resolves to services/payments/migrations whether running compiled
    // (dist/db/db.service.js) or via ts-node (src/db/db.service.ts) — both
    // sit exactly two directories under services/payments, and migrations/
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
   * Runs `fn` inside one transaction on one pinned client.
   *
   * Exists for the outbox: a state change and the event announcing it must
   * commit together or not at all, which two independent pool queries cannot
   * promise — each could land on a different connection.
   */
  async transaction<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
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
