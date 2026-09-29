import { ForbiddenException } from '@nestjs/common';
import { SupersetService } from '../src/superset/superset.service';

/**
 * Row-level security is the *entire* access control for an embedded
 * dashboard: a guest token's RLS clauses are applied by Superset to every
 * query the iframe runs. Issuing one without a clause for a caller who should
 * be restricted exposes every customer's activity to that caller.
 *
 * `rlsFor` is private, which is deliberate — it is not an API — so these
 * reach it the way a test legitimately can. The alternative, exporting it to
 * be testable, would invite a caller to compute clauses themselves.
 */
function rlsFor(permissions: string[], partyId = 'party_123'): Array<{ clause: string }> {
  const service = new SupersetService({ get: () => '' } as never);
  return (service as unknown as {
    rlsFor(partyId: string, permissions: string[]): Array<{ clause: string }>;
  }).rlsFor(partyId, permissions);
}

describe('Superset row-level security', () => {
  it('issues no clause to a caller who may see everything', () => {
    // transactions:read:any means exactly that.
    expect(rlsFor(['transactions:read:any'])).toEqual([]);
    expect(rlsFor(['reports:read'])).toEqual([]);
    expect(rlsFor(['ledger:read'])).toEqual([]);
  });

  it('pins an own-scoped caller to their own party', () => {
    const clauses = rlsFor(['transactions:read:own'], 'party_abc');
    expect(clauses).toHaveLength(1);
    expect(clauses[0].clause).toBe("party_id = 'party_abc'");
  });

  /**
   * The case that matters most. A missing RLS clause is not a safe default —
   * it is the absence of the control, and Superset would happily serve every
   * row to the token.
   */
  it('refuses a caller with no read permission rather than issuing an unrestricted token', () => {
    expect(() => rlsFor([])).toThrow(ForbiddenException);
    expect(() => rlsFor(['kyc:submit', 'payments:write:own'])).toThrow(ForbiddenException);
  });

  it('escapes a quote in the party id', () => {
    // Party ids in this platform are `party_<uuid>`, so there is no quote to
    // escape today. The escaping is here so that stays true if the id format
    // ever changes — a clause is interpolated SQL, and the day somebody
    // widens the id format is not the day to discover that.
    const clauses = rlsFor(['wallets:read:own'], "party_o'brien");
    expect(clauses[0].clause).toBe("party_id = 'party_o''brien'");
  });

  it('prefers the broader grant when a caller holds both', () => {
    // An operator who also happens to hold an own-scoped permission should
    // see the operator view, not be restricted to their own rows.
    expect(rlsFor(['transactions:read:own', 'transactions:read:any'])).toEqual([]);
  });
});
