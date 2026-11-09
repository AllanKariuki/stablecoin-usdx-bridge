import { UnauthorizedException } from '@nestjs/common';
import { ApprovalsController } from '../src/cases/approvals.controller';
import { signCallback, verifyCallback } from '../src/workflow/callback-signature';
import { signCallback as workflowSign } from '../../workflow/src/requests/callback-signature';

const fields = { requestId: 'req-1', subjectType: 'KYC_CASE', subjectId: 'case-1', payloadDigest: 'abc', status: 'APPROVED' };

describe('workflow callback signature', () => {
  it('agrees with the workflow service implementation', () => {
    expect(signCallback('k', fields)).toBe(workflowSign('k', fields));
  });

  it('rejects a missing signature, an empty secret, and any changed field', () => {
    const sig = signCallback('k', fields);
    expect(verifyCallback('k', sig, fields)).toBe(true);
    expect(verifyCallback('k', undefined, fields)).toBe(false);
    expect(verifyCallback('', sig, fields)).toBe(false);
    expect(verifyCallback('other', sig, fields)).toBe(false);
    for (const k of Object.keys(fields) as (keyof typeof fields)[]) {
      expect(verifyCallback('k', sig, { ...fields, [k]: 'x' })).toBe(false);
    }
  });
});

describe('KYC approvals callback', () => {
  const make = (secret: string) => {
    const onApprovalDecision = jest.fn().mockResolvedValue({ applied: true });
    const c = new ApprovalsController({ onApprovalDecision } as never, { get: () => secret } as never);
    return { c, onApprovalDecision };
  };

  it('refuses an unsigned or forged APPROVED and never reaches the case', async () => {
    const { c, onApprovalDecision } = make('k');
    await expect(c.callback(undefined, fields)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(c.callback('deadbeef', fields)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(onApprovalDecision).not.toHaveBeenCalled();
  });

  it('passes a correctly signed decision, with its request id, through', async () => {
    const { c, onApprovalDecision } = make('k');
    await c.callback(signCallback('k', fields), fields);
    expect(onApprovalDecision).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'req-1', status: 'APPROVED' }));
  });
});
