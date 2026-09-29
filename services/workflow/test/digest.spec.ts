import { canonicalize, digestsMatch, payloadDigest } from '../src/requests/digest';

/**
 * The digest is the entire security model of maker-checker on this platform,
 * and it has two properties that pull in opposite directions:
 *
 *  - It must be **stable**: the same payload encoded by two services, in two
 *    languages, at two moments, must produce the same bytes. If it isn't,
 *    approvals start failing verification under load and somebody disables
 *    the control.
 *  - It must be **sensitive**: any change to what was proposed must change
 *    it, or an approved payout could have its destination swapped between
 *    proposal and execution.
 *
 * Every test below is one or the other.
 */

describe('canonical encoding — stability', () => {
  it('is insensitive to key order', () => {
    // The single most likely way two services disagree: JSON.stringify
    // preserves insertion order, and two codebases building the same object
    // rarely build it in the same order.
    const a = { amount: '250.00', currency: 'USD', beneficiary: 'ben_1' };
    const b = { beneficiary: 'ben_1', currency: 'USD', amount: '250.00' };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(payloadDigest(a)).toBe(payloadDigest(b));
  });

  it('sorts nested keys too', () => {
    const a = { outer: { z: 1, a: 2 }, first: true };
    const b = { first: true, outer: { a: 2, z: 1 } };
    expect(payloadDigest(a)).toBe(payloadDigest(b));
  });

  it('treats an absent key and an undefined one as the same', () => {
    // JSON.stringify drops undefined properties, so a caller that sets a
    // field to undefined and one that omits it produce the same wire bytes —
    // and must therefore produce the same digest.
    expect(payloadDigest({ a: 1, b: undefined })).toBe(payloadDigest({ a: 1 }));
  });

  it('encodes a Date the way it crosses the wire', () => {
    const at = new Date('2026-09-28T12:00:00.000Z');
    expect(payloadDigest({ at })).toBe(payloadDigest({ at: '2026-09-28T12:00:00.000Z' }));
  });

  it('produces the same digest for the same payload every time', () => {
    const payload = { action: 'payout', lines: [{ to: 'a', amount: '1.00' }] };
    expect(payloadDigest(payload)).toBe(payloadDigest(payload));
  });
});

describe('canonical encoding — sensitivity', () => {
  const base = { beneficiaryId: 'ben_1', amount: '250.00', currency: 'USD' };

  it('changes when an amount changes', () => {
    expect(payloadDigest({ ...base, amount: '2500.00' })).not.toBe(payloadDigest(base));
  });

  it('changes when a destination is swapped', () => {
    // The attack this exists to stop: a payout approved to one beneficiary,
    // executed against another.
    expect(payloadDigest({ ...base, beneficiaryId: 'ben_attacker' })).not.toBe(payloadDigest(base));
  });

  it('changes when a field is added', () => {
    expect(payloadDigest({ ...base, expedite: true })).not.toBe(payloadDigest(base));
  });

  it('keeps array order significant', () => {
    // Order is meaning: a list of payout lines is not the same payout
    // reordered, and sorting arrays "for consistency" would make two
    // genuinely different proposals digest identically.
    const forward = { lines: ['a', 'b'] };
    const reversed = { lines: ['b', 'a'] };
    expect(payloadDigest(forward)).not.toBe(payloadDigest(reversed));
  });

  it('distinguishes a string from the number that looks like it', () => {
    // Amounts cross boundaries as strings in this platform. A caller that
    // sent 250 where it meant "250.00" must not get a digest that matches.
    expect(payloadDigest({ amount: '250' })).not.toBe(payloadDigest({ amount: 250 }));
  });

  it('distinguishes null from absent', () => {
    expect(payloadDigest({ a: null })).not.toBe(payloadDigest({}));
  });

  it('is not defeated by nesting the same keys differently', () => {
    expect(payloadDigest({ a: { b: 1 } })).not.toBe(payloadDigest({ 'a.b': 1 }));
  });
});

describe('digest comparison', () => {
  it('matches identical digests and rejects different ones', () => {
    const digest = payloadDigest({ a: 1 });
    expect(digestsMatch(digest, digest)).toBe(true);
    expect(digestsMatch(digest, payloadDigest({ a: 2 }))).toBe(false);
  });

  it('rejects a truncated digest rather than matching on a prefix', () => {
    const digest = payloadDigest({ a: 1 });
    expect(digestsMatch(digest, digest.slice(0, -2))).toBe(false);
  });

  it('is prefixed with its algorithm', () => {
    // So that changing the hash later is a visible, versioned migration
    // rather than a silent one where old and new digests are indistinguishable.
    expect(payloadDigest({})).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
