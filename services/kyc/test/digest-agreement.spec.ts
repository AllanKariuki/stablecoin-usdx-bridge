import { canonicalize as kycCanonicalize } from '../src/workflow/workflow.client';
import { canonicalize as workflowCanonicalize } from '../../workflow/src/requests/digest';

/**
 * The two encodings must agree.
 *
 * services/kyc reimplements services/workflow's canonical encoding rather
 * than asking workflow to compute the digest it verifies against — that is
 * deliberate, and it is the whole point: if this service asked workflow for
 * the expected digest, a compromised workflow could answer with whatever
 * digest made its forged approval verify.
 *
 * The cost of that independence is a drift risk. If the two encodings ever
 * disagree, *every* approval starts failing verification at once, and the
 * symptom — "nothing can be approved any more" — points nowhere near the
 * cause. These tests are what turn that from a production incident into a
 * red build.
 *
 * They import workflow's implementation directly across the workspace, which
 * a service must never do at *runtime* (it would defeat the independence) but
 * is exactly right in a test: the point is to compare them.
 */
describe('kyc and workflow agree on the canonical encoding', () => {
  const payloads: Array<[string, unknown]> = [
    ['a KYC approval payload', {
      caseId: 'kyc_123',
      partyId: 'party_456',
      tier: 'TIER_2',
      riskScore: 30,
      providerRef: 'stub_abc',
    }],
    ['the same payload with keys in a different order', {
      providerRef: 'stub_abc',
      riskScore: 30,
      tier: 'TIER_2',
      partyId: 'party_456',
      caseId: 'kyc_123',
    }],
    ['a null risk score, which an unscreened case has', {
      caseId: 'kyc_123',
      partyId: 'party_456',
      tier: 'TIER_1',
      riskScore: null,
      providerRef: '',
    }],
    ['an enforcement payload', {
      actionId: 'enf_1',
      kind: 'BLACKLIST',
      chain: 'ETHEREUM',
      target: '0xabc',
      partyId: 'party_1',
    }],
    ['nested objects', { a: { z: 1, b: { y: 2, a: 3 } }, list: [1, 'two', null] }],
    ['an empty object', {}],
    ['an array at the root', [3, 1, 2]],
    ['undefined properties, which JSON.stringify drops', { a: 1, b: undefined, c: 'x' }],
    ['strings that need escaping', { note: 'he said "no" \\ then left\n' }],
    ['decimal-string amounts, which is how every amount crosses a boundary here', {
      amount: '250.00',
      currency: 'USD',
    }],
  ];

  it.each(payloads)('%s', (_name, payload) => {
    expect(kycCanonicalize(payload)).toBe(workflowCanonicalize(payload));
  });

  it('agrees on Date handling', () => {
    const at = new Date('2026-09-29T09:30:00.000Z');
    expect(kycCanonicalize({ at })).toBe(workflowCanonicalize({ at }));
  });

  it('agrees that key order does not matter', () => {
    const a = { x: 1, y: 2 };
    const b = { y: 2, x: 1 };
    expect(kycCanonicalize(a)).toBe(kycCanonicalize(b));
    expect(kycCanonicalize(a)).toBe(workflowCanonicalize(b));
  });
});
