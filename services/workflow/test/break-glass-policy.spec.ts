import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * H4's break-glass redemption confirm proposes against the seeded policy
 * `redemption.break_glass`. This test pins the seed rather than a live row:
 * the migration runner applies 001_workflow.sql once, so an existing
 * deployment's policy row IS this INSERT — and the policy's shape is the
 * security control (one approver, treasury or admin, never the proposer).
 *
 * core-ledger's confirm handler names the action as a string, so a drift
 * here means every break-glass proposal is refused by workflow ("no approval
 * policy is defined") — closed, but a production outage, which is why the
 * string is pinned rather than hoped about.
 */
describe('break-glass approval policy seed', () => {
  const migration = readFileSync(join(__dirname, '..', 'migrations', '001_workflow.sql'), 'utf8');

  it('seeds redemption.break_glass with one approver from treasury or admin', () => {
    const row = migration.match(/\(\s*'pol_break_glass',\s*'redemption\.break_glass',[^)]*\)/s);
    expect(row).not.toBeNull();
    const text = row![0];
    expect(text).toContain('1');
    expect(text).toContain("ARRAY['treasury', 'admin']");
  });

  it('defaults exclude_initiator TRUE, so the proposer can never approve their own break-glass', () => {
    // The seed INSERT does not name exclude_initiator; the table default is
    // the control. Both are pinned: a column whose default changed would
    // silently turn maker-checker into self-approval.
    expect(migration).toMatch(/exclude_initiator BOOLEAN NOT NULL DEFAULT TRUE/);
    expect(migration).not.toMatch(/exclude_initiator BOOLEAN NOT NULL DEFAULT FALSE/);
  });

  it('expires break-glass approvals rather than leaving them approvable forever', () => {
    const row = migration.match(/\(\s*'pol_break_glass',\s*'redemption\.break_glass',[^)]*\)/s);
    // 12 hours: an approval granted against day-old context is not an
    // approval of what is on chain now.
    expect(row![0]).toContain('12');
  });
});
