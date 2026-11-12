import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUDIT_OUTBOX_SCHEMA_SQL } from '@damp/nest-platform';

/**
 * The migration is the shared schema copied into this service's numbered
 * migrations. If they drift, the shared relay runs against a table it did
 * not define.
 */
describe('audit_outbox migration', () => {
  it('matches @damp/nest-platform AUDIT_OUTBOX_SCHEMA_SQL', () => {
    const normalise = (sql: string) =>
      sql
        .replace(/--[^\n]*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const migration = readFileSync(join(__dirname, '..', 'migrations', '002_audit_outbox.sql'), 'utf8');
    expect(normalise(migration)).toBe(normalise(AUDIT_OUTBOX_SCHEMA_SQL));
  });
});
