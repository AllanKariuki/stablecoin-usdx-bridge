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

  it('names the chains in a bridge’s four steps', () => {
    const t = { ...base, kind: 'BRIDGE' as const, sourceChain: 'ETHEREUM', targetChain: 'SOLANA' };
    expect(sagaSteps(t).map((s) => s.label)).toEqual([
      'USD-X debited on the ledger',
      'Burned on Ethereum',
      'Minted on Solana',
      'Credited to your Solana wallet',
    ]);
  });

  it('walks a bridge through burn, burn finality, mint and credit', () => {
    const t = { ...base, kind: 'BRIDGE' as const, sourceChain: 'ETHEREUM', targetChain: 'SOLANA' };
    expect(states(t)).toEqual(['done', 'active', 'todo', 'todo']);
    expect(states({ ...t, sourceTxHash: '0xab' })).toEqual(['done', 'done', 'active', 'todo']);
    expect(states({ ...t, status: 'BURN_CONFIRMED' })).toEqual(['done', 'done', 'active', 'todo']);
    expect(states({ ...t, status: 'MINT_SUBMITTED', destTxHash: '0xcd' })).toEqual(['done', 'done', 'done', 'active']);
    expect(states({ ...t, status: 'COMPLETED' })).toEqual(['done', 'done', 'done', 'done']);
  });

  it('marks where a failed bridge stopped', () => {
    const t = { ...base, kind: 'BRIDGE' as const, sourceChain: 'ETHEREUM', targetChain: 'SOLANA' };
    expect(states({ ...t, status: 'FAILED' })).toEqual(['done', 'failed', 'todo', 'todo']);
    // A destination mint that terminally failed after the burn was final.
    expect(states({ ...t, status: 'COMPENSATED', sourceTxHash: '0xab' })).toEqual(['done', 'done', 'failed', 'todo']);
  });
});
