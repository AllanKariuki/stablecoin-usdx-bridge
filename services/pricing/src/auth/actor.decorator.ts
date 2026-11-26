import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ServiceAuthRequest, serviceIdentityFrom } from '@damp/nest-platform';

/**
 * Who changed a pricing input, for the audit trail: the party id
 * auth-proxy resolved (X-User-Id), released only when the request's
 * verified service token holds pricing.user-proxy (svc-bff) — the same
 * gate rms's Actor uses, because an identity header is only as good as the
 * role that is allowed to assert it.
 */
export const UNATTRIBUTED = 'unattributed';

export const Actor = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<ServiceAuthRequest>();
  const userId = serviceIdentityFrom(req, { userIdRequired: false }).userId;
  return userId !== '' ? userId : UNATTRIBUTED;
});
