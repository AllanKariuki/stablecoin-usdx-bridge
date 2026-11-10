import { StubCustodianProvider } from '../src/custodians/custodian-provider';
import { toMoney } from '../src/money/money';

/**
 * The stub custodian is the demo's forcing function, and R7's answer: a
 * reconciliation leg nobody has ever seen break is a leg nobody knows works.
 * What these assert is that the drift is applied exactly and in the right
 * direction — a sign error here would make the DoD's shortfall look like
 * surplus and Leg C would pass through the one condition it exists to catch.
 */
describe('StubCustodianProvider', () => {
  const custodian = (config: Record<string, unknown>) => ({
    id: 'primary',
    currency: 'USD',
    accountRef: 'DAMP-TRUST-001',
    config,
  });

  const provider = new StubCustodianProvider(async () => toMoney('100000.00', 'USD'));

  it('reports the ledger cash position exactly when no drift is armed', () => {
    return provider.fetchBalance(custodian({})).then((result) => {
      expect(result.balance.amount).toBe('100000.00');
    });
  });

  it('reports a shortfall when a negative drift is armed', async () => {
    const result = await provider.fetchBalance(custodian({ drift: '-1000.00' }));
    expect(result.balance.amount).toBe('99000.00');
  });

  it('reports headroom when a positive drift is armed', async () => {
    // A custodian holding more than the ledger expects is unminted headroom,
    // not a break — Leg C is an inequality precisely so this case doesn't
    // page anyone.
    const result = await provider.fetchBalance(custodian({ drift: '2500.00' }));
    expect(result.balance.amount).toBe('102500.00');
  });

  it('stamps the custodian statement reference it read the balance from', async () => {
    const result = await provider.fetchBalance(custodian({}));
    expect(result.statementRef).toMatch(/^DAMP-TRUST-001\/\d{4}-\d{2}-\d{2}$/);
  });
});
