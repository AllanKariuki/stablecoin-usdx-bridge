import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

/**
 * A minimal, explicit stand-in for core-ledger's goose
 * (core-ledger/internal/ledger/repository.go) — goose itself is a Go
 * library with no Node equivalent in this repo, and the actual need here
 * (apply an ordered set of plain .sql files exactly once, tracked in a
 * version table) doesn't justify adopting a new ORM/migration framework
 * for identity's one table set. Every file in `dir` is applied whole, in
 * one transaction, the first time this runs against a given database;
 * already-applied files (tracked by filename in schema_migrations) are
 * skipped on every later boot. Returns the filenames actually applied,
 * mainly so tests can assert on it.
 */
export async function runMigrations(pool: Pool, dir: string): Promise<string[]> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  const { rows } = await pool.query<{ version: string }>('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.version));

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      newlyApplied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      client.release();
    }
  }
  return newlyApplied;
}
