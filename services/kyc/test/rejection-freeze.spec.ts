import { CasesService } from '../src/cases/cases.service';

/**
 * H5: rejecting a KYC case freezes the party's wallets when — and only when
 * — the rejection leaves them below every tier. A rejected *upgrade* keeps
 * the tier already held and must not freeze it; a decided case re-decided
 * does nothing at all. The freeze goes through CoreLedgerClient
 * (setWalletsFrozen), whose own wire behaviour is covered by
 * core-ledger.client.spec.ts.
 */

interface RejectHarness {
  service: CasesService;
  tierFor: jest.Mock;
  frozen: string[];
}

function harness(input: { partyId: string; rank: number; decides?: boolean }): RejectHarness {
  const { partyId, rank, decides = true } = input;
  const frozen: string[] = [];
  let queries = 0;
  const tx = {
    query: jest.fn(async () => {
      queries += 1;
      // First call inside the transaction is the decision UPDATE.
      return queries === 1 && decides
        ? { rows: [{ before: 'PENDING_REVIEW', party_id: partyId }] }
        : { rows: [] };
    }),
  };
  const db = { transaction: jest.fn(async (fn: (q: unknown) => Promise<unknown>) => fn(tx)) };
  const tierFor = jest.fn(async () => ({ name: 'TIER_0', rank }));
  const service = new CasesService(
    db as never,
    { tierFor, byName: jest.fn(), all: jest.fn(), grant: jest.fn(), history: jest.fn() } as never,
    { name: 'stub', screen: jest.fn() } as never,
    { propose: jest.fn(), digest: jest.fn() } as never,
    { setWalletsActive: jest.fn(), setWalletsFrozen: jest.fn(async (p: string) => void frozen.push(p)) } as never,
  );
  return { service, tierFor, frozen };
}

describe('CasesService.reject freezes wallets (H5)', () => {
  it('freezes the party when the rejection leaves them at rank 0', async () => {
    const h = harness({ partyId: 'party_1', rank: 0 });
    await h.service.reject('kyc_1', 'compliance-1', 'failed screening');
    expect(h.frozen).toEqual(['party_1']);
  });

  it('does not freeze a party who keeps a tier (a rejected upgrade)', async () => {
    const h = harness({ partyId: 'party_2', rank: 1 });
    await h.service.reject('kyc_2', 'compliance-1', 'upgrade refused');
    expect(h.frozen).toEqual([]);
  });

  it('does nothing on re-deciding an already-decided case', async () => {
    const h = harness({ partyId: 'party_3', rank: 0, decides: false });
    await h.service.reject('kyc_3', 'compliance-1', 'late rejection');
    expect(h.frozen).toEqual([]);
    expect(h.tierFor).not.toHaveBeenCalled();
  });
});
