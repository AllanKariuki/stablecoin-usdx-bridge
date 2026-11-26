import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ServiceAuthRequest, serviceIdentityFrom } from '@damp/nest-platform';

/**
 * Who is changing a reconciliation input, for the audit trail: the party id
 * auth-proxy resolved (X-User-Id).
 *
 * Since H3 the header is released by the shared serviceIdentityFrom only when
 * the request's verified service token holds rms.user-proxy (svc-bff). Unlike
 * payments' CurrentUser this still does not refuse a request whose header is
 * missing — rms records such a change as UNATTRIBUTED instead, visible in the
 * trail as exactly what it is, rather than silently attributed to "rms".
 */
export const UNATTRIBUTED = 'unattributed';

export const Actor = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<ServiceAuthRequest>();
  const userId = serviceIdentityFrom(req, { userIdRequired: false }).userId;
  return userId !== '' ? userId : UNATTRIBUTED;
});
