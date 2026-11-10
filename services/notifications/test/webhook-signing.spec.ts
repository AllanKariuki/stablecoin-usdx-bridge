import { sign, verify } from '../src/webhooks/webhooks.service';

/**
 * The signature is the only thing standing between a subscriber and a forged
 * "your account was credited" callback, so these test the two properties that
 * matter: a valid signature verifies, and the specific attacks the scheme is
 * shaped to stop are stopped.
 */
describe('webhook signing', () => {
  const secret = 'whsec_test_secret';
  const body = JSON.stringify({ event: 'payment.settled', data: { amount: '250.00' } });

  it('verifies a signature it just produced', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verify(secret, sign(secret, now, body), body)).toBe(true);
  });

  it('rejects a signature made with a different secret', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verify('whsec_wrong', sign(secret, now, body), body)).toBe(false);
  });

  it('rejects a body that changed after signing', () => {
    const now = Math.floor(Date.now() / 1000);
    const header = sign(secret, now, body);
    const tampered = JSON.stringify({ event: 'payment.settled', data: { amount: '25000.00' } });
    expect(verify(secret, header, tampered)).toBe(false);
  });

  it('rejects a replayed request outside the tolerance window', () => {
    // This is why the timestamp is signed *with* the body. Signing the body
    // alone would let one captured legitimate call be resent forever with a
    // signature that still verifies.
    const stale = Math.floor(Date.now() / 1000) - 3600;
    expect(verify(secret, sign(secret, stale, body), body)).toBe(false);
  });

  it('rejects a timestamp moved forward without re-signing', () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const header = sign(secret, old, body);
    const forged = header.replace(`t=${old}`, `t=${Math.floor(Date.now() / 1000)}`);
    expect(verify(secret, forged, body)).toBe(false);
  });

  it('rejects a malformed header instead of throwing', () => {
    for (const header of ['', 'garbage', 't=notanumber,v1=abc', 't=1,v1=zzz']) {
      expect(verify(secret, header, body)).toBe(false);
    }
  });

  it('produces the documented header shape', () => {
    // Subscribers parse this. The shape is Stripe's, because it is the one
    // most of them already have code for.
    expect(sign(secret, 1700000000, body)).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
  });
});
