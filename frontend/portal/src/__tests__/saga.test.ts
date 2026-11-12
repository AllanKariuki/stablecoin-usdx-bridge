import { describe, expect, it } from 'vitest';
import type { SagaTransfer } from '@damp/web-shared/api';
import { sagaLabel, sagaSteps } from '../lib/saga';

const base = { kind: 'MINT', status: 'PENDING', sourceTxHash: '', destTxHash: '' } as SagaTransfer;
const states = (t: Partial<SagaTransfer>) => sagaSteps({ ...base, ...t }).map((s) => s.state);

describe('saga steps', () => {
  it('walks a mint through ledger → submitted → final', () => {
    expect(states({ status: 'PENDING' })).toEqual(['done', 'active', 'todo']);
    expect(states({ status: 'MINT_SUBMITTED', destTxHash: '0xab' })).toEqual(['done', 'done', 'active']);
    expect(states({ status: 'COMPLETED' })).toEqual(['done', 'done', 'done']);
  });

  it('marks where a failed saga stopped', () => {
    expect(states({ status: 'FAILED' })).toEqual(['done', 'failed', 'todo']);
    expect(states({ status: 'COMPENSATED', destTxHash: '0xab' })).toEqual(['done', 'done', 'failed']);
  });

  it('reads a redemption burn in flight from its source hash', () => {
    const t = { ...base, kind: 'REDEEM' as const, sourceTxHash: '0xcd' };
    expect(sagaLabel(t)).toBe('Burn submitted, waiting for finality');
    expect(sagaSteps(t).map((s) => s.state)).toEqual(['done', 'done', 'active', 'todo']);
    expect(sagaSteps({ ...t, status: 'BURN_CONFIRMED' }).map((s) => s.state)).toEqual(['done', 'done', 'done', 'active']);
  });
});
