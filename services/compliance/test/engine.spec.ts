import { Context, Movement, Rule, evaluate } from '../src/rules/engine';

/**
 * These are tests of rules that decide whether somebody's money is allowed to
 * move. Each one asserts the thing the rule's *name* claims, at the boundary
 * where it is easiest to get wrong.
 */

const now = new Date('2026-09-28T12:00:00Z');

function movement(over: Partial<Movement> = {}): Movement {
  return {
    transactionId: 'tx_1',
    partyId: 'party_1',
    type: 'INTERNAL_TRANSFER',
    amount: '100.00',
    currency: 'USD',
    counterparty: 'party_2',
    postedAt: now,
    ...over,
  };
}

function context(over: Partial<Context> = {}): Context {
  return {
    recent: [],
    firstSeenAt: new Date('2025-01-01T00:00:00Z'),
    counterpartyScreening: null,
    now,
    ...over,
  };
}

function rule(over: Partial<Rule> = {}): Rule {
  return {
    id: 'r1',
    name: 'test rule',
    kind: 'AMOUNT_THRESHOLD',
    params: {},
    severity: 'medium',
    action: 'FLAG',
    active: true,
    ...over,
  };
}

/** Movements `minutesAgo` before `now`. */
function history(amounts: string[], minutesAgo: number[]): Movement[] {
  return amounts.map((amount, i) =>
    movement({
      transactionId: `tx_h${i}`,
      amount,
      postedAt: new Date(now.getTime() - minutesAgo[i] * 60_000),
    }),
  );
}

describe('AMOUNT_THRESHOLD', () => {
  const r = rule({ kind: 'AMOUNT_THRESHOLD', params: { currency: 'USD', threshold: '10000.00' } });

  it('fires exactly at the threshold, not only above it', () => {
    // A reporting threshold of $10,000 means $10,000 is reportable. Treating
    // it as "over ten thousand" makes exactly-at-the-limit the safe amount to
    // send, which is the opposite of the intent.
    expect(evaluate([r], movement({ amount: '10000.00' }), context())).toHaveLength(1);
  });

  it('does not fire one cent below', () => {
    expect(evaluate([r], movement({ amount: '9999.99' }), context())).toHaveLength(0);
  });

  it('ignores a different currency', () => {
    // A KES rule and a USD rule are different rules. Comparing 10000 KES
    // against a USD threshold would flag roughly every Kenyan transaction.
    expect(evaluate([r], movement({ amount: '50000.00', currency: 'KES' }), context())).toHaveLength(0);
  });

  it('does not fire on an inactive rule', () => {
    const inactive = { ...r, active: false };
    expect(evaluate([inactive], movement({ amount: '50000.00' }), context())).toHaveLength(0);
  });
});

describe('VELOCITY', () => {
  const r = rule({ kind: 'VELOCITY', params: { count: 5, windowMinutes: 60 } });

  it('counts the movement being evaluated, not just the history', () => {
    // Four in history plus this one is five. Counting only history would
    // make the rule fire one transaction late, every time.
    const recent = history(['1.00', '1.00', '1.00', '1.00'], [10, 20, 30, 40]);
    expect(evaluate([r], movement(), context({ recent }))).toHaveLength(1);
  });

  it('does not fire one short', () => {
    const recent = history(['1.00', '1.00', '1.00'], [10, 20, 30]);
    expect(evaluate([r], movement(), context({ recent }))).toHaveLength(0);
  });

  it('excludes movements outside the window', () => {
    // Four movements, but three of them are yesterday's.
    const recent = history(['1.00', '1.00', '1.00', '1.00'], [10, 1500, 1600, 1700]);
    expect(evaluate([r], movement(), context({ recent }))).toHaveLength(0);
  });
});

describe('AGGREGATE_WINDOW', () => {
  const r = rule({
    kind: 'AGGREGATE_WINDOW',
    params: { currency: 'USD', threshold: '50000.00', windowMinutes: 1440 },
  });

  it('catches a total that no single movement reaches', () => {
    // The whole point: five transfers of $9,900 trip no amount threshold and
    // total $49,500 — add this one and the day is over the limit.
    const recent = history(['9900.00', '9900.00', '9900.00', '9900.00', '9900.00'], [60, 120, 180, 240, 300]);
    const findings = evaluate([r], movement({ amount: '600.00' }), context({ recent }));
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.total).toBe('50100.00');
  });

  it('sums exactly, without floating-point drift', () => {
    // 0.1 + 0.2 territory. A total accumulated as floats fires at
    // $49,999.99999 instead of $50,000 — or doesn't fire when it should.
    const recent = history(Array(10).fill('0.10'), Array(10).fill(10));
    const findings = evaluate(
      [rule({ kind: 'AGGREGATE_WINDOW', params: { currency: 'USD', threshold: '1.10', windowMinutes: 1440 } })],
      movement({ amount: '0.10' }),
      context({ recent }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.total).toBe('1.10');
  });
});

describe('STRUCTURING', () => {
  const r = rule({
    kind: 'STRUCTURING',
    params: { currency: 'USD', threshold: '10000.00', marginPct: 10, count: 3, windowMinutes: 1440 },
  });

  it('catches repeated amounts just under the threshold', () => {
    // The pattern thresholds themselves create. None of these trips an
    // amount rule; together they are the technique.
    const recent = history(['9500.00', '9800.00'], [120, 240]);
    const findings = evaluate([r], movement({ amount: '9900.00' }), context({ recent }));
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.count).toBe(3);
  });

  it('ignores amounts well below the band', () => {
    // $500 transfers are not structuring, they are ordinary use. A rule that
    // flagged them would bury the cases that matter.
    const recent = history(['500.00', '500.00'], [120, 240]);
    expect(evaluate([r], movement({ amount: '500.00' }), context({ recent }))).toHaveLength(0);
  });

  it('ignores an amount at or above the threshold', () => {
    // Somebody sending $10,000 is not hiding from the $10,000 threshold —
    // they have tripped it, and AMOUNT_THRESHOLD is the rule for that.
    const recent = history(['9500.00', '9800.00'], [120, 240]);
    expect(evaluate([r], movement({ amount: '10000.00' }), context({ recent }))).toHaveLength(0);
  });

  it('does not fire below the count', () => {
    const recent = history(['9500.00'], [120]);
    expect(evaluate([r], movement({ amount: '9900.00' }), context({ recent }))).toHaveLength(0);
  });
});

describe('NEW_PARTY_LARGE_TX', () => {
  const r = rule({
    kind: 'NEW_PARTY_LARGE_TX',
    params: { currency: 'USD', threshold: '5000.00', accountAgeHours: 24 },
  });

  it('fires on a large first movement from a party with no history', () => {
    // firstSeenAt null means this is their first transaction — the case the
    // rule exists for. Treating null as "not new" would exempt exactly it.
    expect(evaluate([r], movement({ amount: '9000.00' }), context({ firstSeenAt: null }))).toHaveLength(1);
  });

  it('does not fire for an established party', () => {
    expect(
      evaluate([r], movement({ amount: '9000.00' }), context({ firstSeenAt: new Date('2025-01-01') })),
    ).toHaveLength(0);
  });

  it('does not fire for a small movement from a new party', () => {
    expect(evaluate([r], movement({ amount: '10.00' }), context({ firstSeenAt: null }))).toHaveLength(0);
  });
});

describe('SANCTIONED_COUNTERPARTY', () => {
  const r = rule({ kind: 'SANCTIONED_COUNTERPARTY', severity: 'critical' });

  it('fires on a BLOCK screening', () => {
    const findings = evaluate(
      [r],
      movement(),
      context({ counterpartyScreening: { outcome: 'BLOCK', matches: [{ list: 'OFAC' }] } }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.matches).toEqual([{ list: 'OFAC' }]);
  });

  it('fires on REVIEW too', () => {
    expect(
      evaluate([r], movement(), context({ counterpartyScreening: { outcome: 'REVIEW', matches: [] } })),
    ).toHaveLength(1);
  });

  it('does not fire on CLEAR, or when nothing has been screened', () => {
    expect(
      evaluate([r], movement(), context({ counterpartyScreening: { outcome: 'CLEAR', matches: [] } })),
    ).toHaveLength(0);
    expect(evaluate([r], movement(), context())).toHaveLength(0);
  });
});

describe('the engine itself', () => {
  it('returns every rule that fires, not the first', () => {
    // An investigator needs all of them: "large, and from a brand new
    // account, and to a flagged counterparty" is a different case from any
    // one of those alone.
    const rules = [
      rule({ id: 'a', kind: 'AMOUNT_THRESHOLD', params: { currency: 'USD', threshold: '1000.00' } }),
      rule({ id: 'b', kind: 'NEW_PARTY_LARGE_TX', params: { currency: 'USD', threshold: '1000.00', accountAgeHours: 24 } }),
    ];
    expect(evaluate(rules, movement({ amount: '9000.00' }), context({ firstSeenAt: null }))).toHaveLength(2);
  });

  it('ignores a rule kind it does not recognise rather than throwing', () => {
    // A rule row written by a newer version of this service must not stop an
    // older replica evaluating every other rule on the movement.
    const unknown = { ...rule(), kind: 'FROM_THE_FUTURE' as never };
    const known = rule({ id: 'b', kind: 'AMOUNT_THRESHOLD', params: { currency: 'USD', threshold: '1.00' } });
    expect(evaluate([unknown, known], movement(), context())).toHaveLength(1);
  });
});
