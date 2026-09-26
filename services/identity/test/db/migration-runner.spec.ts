import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { runMigrations } from '../../src/db/migration-runner';

const TEST_DATABASE_URL =
  process.env.IDENTITY_TEST_DATABASE_URL ??
  'postgres://identity:identity@localhost:55433/identity_test?sslmode=disable';

describe('runMigrations', () => {
  let pool: Pool;
  let dir: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query('DROP TABLE IF EXISTS migration_runner_probe, schema_migrations CASCADE');
    dir = mkdtempSync(join(tmpdir(), 'identity-migrations-'));
    writeFileSync(join(dir, '001_probe.sql'), 'CREATE TABLE migration_runner_probe (id INT PRIMARY KEY);');
  });

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS migration_runner_probe, schema_migrations CASCADE');
    await pool.end();
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies a new migration and records it in schema_migrations', async () => {
    const applied = await runMigrations(pool, dir);
    expect(applied).toEqual(['001_probe.sql']);

    const { rows } = await pool.query<{ reg: string | null }>("SELECT to_regclass('migration_runner_probe') AS reg");
    expect(rows[0].reg).toBe('migration_runner_probe');
  });

  it('is a no-op against an already-applied migration', async () => {
    const applied = await runMigrations(pool, dir);
    expect(applied).toEqual([]);
  });

  it('applies only the new file when one migration already ran', async () => {
    writeFileSync(join(dir, '002_probe_two.sql'), 'CREATE TABLE migration_runner_probe_two (id INT PRIMARY KEY);');
    const applied = await runMigrations(pool, dir);
    expect(applied).toEqual(['002_probe_two.sql']);
    await pool.query('DROP TABLE IF EXISTS migration_runner_probe_two');
  });
});
