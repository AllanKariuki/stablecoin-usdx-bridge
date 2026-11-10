import { StubKycProvider } from '../src/providers/kyc-provider';

/**
 * The stub is deterministic by email domain, which the plan asks for by name:
 * *"StubKyc deterministic by email domain so demos reproduce"*.
 *
 * A random stub makes a demo that cannot be rehearsed — three clean runs and
 * a rejection on the fourth, in front of whoever you were showing — and makes
 * the rejection path untestable, because no test can arrange for one.
 */
describe('StubKycProvider', () => {
  const provider = new StubKycProvider();

  const subject = (over: Partial<Parameters<StubKycProvider['screen']>[0]> = {}) => ({
    partyId: 'party_1',
    email: 'someone@example.com',
    fullName: 'A Person',
    country: 'KE',
    documentKinds: ['PASSPORT', 'SELFIE'],
    ...over,
  });

  it('clears an ordinary applicant', async () => {
    const result = await provider.screen(subject());
    expect(result.outcome).toBe('CLEAR');
  });

  it('rejects @reject.test', async () => {
    const result = await provider.screen(subject({ email: 'x@reject.test' }));
    expect(result.outcome).toBe('REJECT');
    expect(result.riskScore).toBeGreaterThanOrEqual(90);
    expect(result.reasons.join(' ')).toMatch(/sanctions/i);
  });

  it('sends @review.test to a human', async () => {
    expect((await provider.screen(subject({ email: 'x@review.test' }))).outcome).toBe('REVIEW');
  });

  it('flags @pep.test with a higher score than an ordinary review', async () => {
    const pep = await provider.screen(subject({ email: 'x@pep.test', partyId: 'p' }));
    const review = await provider.screen(subject({ email: 'x@review.test', partyId: 'p' }));
    expect(pep.outcome).toBe('REVIEW');
    expect(pep.riskScore).toBeGreaterThan(review.riskScore);
  });

  it('never clears an applicant with no documents', async () => {
    // A provider cannot clear somebody whose evidence is incomplete. Letting
    // the stub say otherwise would let a demo approve a case a real provider
    // would bounce.
    const result = await provider.screen(subject({ documentKinds: [] }));
    expect(result.outcome).toBe('REVIEW');
    expect(result.reasons).toContain('No documents submitted');
  });

  it('keeps a rejection a rejection even with documents missing', async () => {
    const result = await provider.screen(subject({ email: 'x@reject.test', documentKinds: [] }));
    expect(result.outcome).toBe('REJECT');
  });

  it('gives the same party the same score every time', async () => {
    // Including across a database reset, which is when a demo usually breaks.
    const first = await provider.screen(subject({ partyId: 'party_stable' }));
    const second = await provider.screen(subject({ partyId: 'party_stable' }));
    expect(first.riskScore).toBe(second.riskScore);
    expect(first.providerRef).toBe(second.providerRef);
  });

  it('gives different parties different scores', async () => {
    const a = await provider.screen(subject({ partyId: 'party_a' }));
    const b = await provider.screen(subject({ partyId: 'party_b' }));
    expect(a.providerRef).not.toBe(b.providerRef);
  });
});
