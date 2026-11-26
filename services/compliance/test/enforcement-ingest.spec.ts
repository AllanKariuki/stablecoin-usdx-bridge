import { ConfigService } from '@nestjs/config';
import { IngestService } from '../src/ingest/ingest.service';
import { EnforcementService } from '../src/enforcement/enforcement.service';
import { DbService } from '../src/db/db.service';
import { ScreeningService } from '../src/screening/screening.service';

/**
 * H6: core-ledger's damp.ledger.chain_enforcement_finalized.v1 event is
 * routed to the enforcement service by reference — FINAL/FAILED only, an
 * unknown status or a missing reference is refused without touching the
 * enforcement table.
 */

class FakeEnforcement {
  applied: Array<{ reference: string; status: 'FINAL' | 'FAILED'; txHash: string; failureReason: string }> = [];

  async applyChainOutcome(input: {
    reference: string;
    status: 'FINAL' | 'FAILED';
    txHash: string;
    failureReason: string;
  }): Promise<{ applied: boolean; reason?: string }> {
    this.applied.push(input);
    return { applied: true };
  }
}

function ingest(enforcement: FakeEnforcement) {
  const config = {
    get: (key: string) => ({ HISTORY_WINDOW_MINUTES: 1440 })[key],
  } as unknown as ConfigService;
  return new IngestService(
    {} as unknown as DbService,
    {} as unknown as ScreeningService,
    enforcement as unknown as EnforcementService,
    config,
  );
}

describe('IngestService enforcement finality routing (H6)', () => {
  it('routes a FINAL event to the enforcement service by reference', async () => {
    const enforcement = new FakeEnforcement();
    const result = await ingest(enforcement).onEnforcementFinalized({
      reference: 'enf_1',
      action: 'BLACKLIST',
      chain: 'ETHEREUM',
      address: '0xE1',
      tx_hash: '0xabc',
      status: 'FINAL',
    });

    expect(result).toEqual({ applied: true });
    expect(enforcement.applied).toEqual([
      { reference: 'enf_1', status: 'FINAL', txHash: '0xabc', failureReason: '' },
    ]);
  });

  it('routes a FAILED event with its reason', async () => {
    const enforcement = new FakeEnforcement();
    const result = await ingest(enforcement).onEnforcementFinalized({
      reference: 'enf_1',
      status: 'FAILED',
      tx_hash: '0xabc',
      failure_reason: 'reverted on chain',
    });

    expect(result).toEqual({ applied: true });
    expect(enforcement.applied[0]).toEqual({
      reference: 'enf_1',
      status: 'FAILED',
      txHash: '0xabc',
      failureReason: 'reverted on chain',
    });
  });

  it('refuses an event with no reference or an unknown status', async () => {
    const enforcement = new FakeEnforcement();
    const noRef = await ingest(enforcement).onEnforcementFinalized({ status: 'FINAL' });
    expect(noRef).toEqual({ applied: false, reason: 'the event carries no reference' });

    const unknown = await ingest(enforcement).onEnforcementFinalized({ reference: 'enf_1', status: 'SUBMITTED' });
    expect(unknown).toEqual({ applied: false, reason: 'unknown enforcement status SUBMITTED' });
    expect(enforcement.applied).toHaveLength(0);
  });
});
