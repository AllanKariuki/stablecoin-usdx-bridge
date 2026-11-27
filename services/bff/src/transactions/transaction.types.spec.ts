import { CoreLedgerTransaction, toTransactionView } from './transaction.types';

const base: CoreLedgerTransaction = {
  id: 'tx-1',
  type: 'FX_PAYMENT',
  status: 'POSTED',
  reversed: false,
  value_date: '2026-11-27',
  description: 'Pay invoice',
  external_ref: '',
  created_at: '2026-11-27T09:00:00Z',
  entries: [],
};

describe('toTransactionView', () => {
  it('maps the FX rate and spread, and never exposes the rest of metadata', () => {
    const view = toTransactionView({
      ...base,
      metadata: {
        rate: '129.500000',
        spread_bps: 100,
        payee_user_id: 'user-victim',
        net: '99999',
      },
    });

    expect(view.fx).toEqual({ rate: '129.500000', spreadBps: 100 });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('payee_user_id');
    expect(serialized).not.toContain('user-victim');
    expect(serialized).not.toContain('99999');
    expect(view).not.toHaveProperty('metadata');
  });

  it('omits fx when metadata carries no FX numbers', () => {
    const view = toTransactionView({ ...base, type: 'FIAT_DEPOSIT', metadata: { usdx_amount: '1000000' } });

    expect(view.fx).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain('usdx_amount');
  });

  it('omits fx when metadata is absent or only half the pair is present', () => {
    expect(toTransactionView(base).fx).toBeUndefined();
    expect(toTransactionView({ ...base, metadata: { rate: '129.5' } }).fx).toBeUndefined();
    expect(toTransactionView({ ...base, metadata: { spread_bps: 100 } }).fx).toBeUndefined();
  });
});
