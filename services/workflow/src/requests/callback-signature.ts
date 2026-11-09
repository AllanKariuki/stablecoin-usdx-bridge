import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Authenticates workflow's decision callback.
 *
 * The payload digest proves a decision is about a specific payload; it does
 * not prove workflow made the decision, because anyone who can read the
 * subject can recompute the digest. This HMAC is what says the callback came
 * from workflow. Key it with WORKFLOW_CALLBACK_SECRET, shared by workflow and
 * its callers. The signed string binds the request id too, so a genuine
 * callback cannot be replayed against another request.
 *
 * Duplicated in workflow, kyc and compliance on purpose, like the digest
 * encoder: callers must not depend on code in the service they are checking.
 */
export const SIGNATURE_HEADER = 'x-workflow-signature';

export function signCallback(
  secret: string,
  f: { requestId: string; subjectType: string; subjectId: string; payloadDigest: string; status: string },
): string {
  const msg = [f.requestId, f.subjectType, f.subjectId, f.payloadDigest, f.status].join('\n');
  return createHmac('sha256', secret).update(msg).digest('hex');
}

export function verifyCallback(
  secret: string,
  presented: string | undefined,
  f: Parameters<typeof signCallback>[1],
): boolean {
  if (!secret || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(signCallback(secret, f));
  return a.length === b.length && timingSafeEqual(a, b);
}
