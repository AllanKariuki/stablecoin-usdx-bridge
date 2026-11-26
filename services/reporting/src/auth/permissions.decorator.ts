import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ServiceAuthRequest, serviceIdentityFrom } from '@damp/nest-platform';

/**
 * The permissions auth-proxy resolved, from X-Permissions.
 *
 * Since H3 these headers are no longer trusted on the strength of the network
 * alone: the shared serviceIdentityFrom only releases them when the request's
 * verified service token holds reporting.user-proxy — the role granted to
 * svc-bff and nothing else.
 *
 * This matters more here than elsewhere. These permissions decide the
 * row-level security clause on a Superset guest token — the entire access
 * control for an embedded dashboard — so reading them from a request body
 * would be letting the caller choose what they can see.
 */
export const Permissions = createParamDecorator((_data: unknown, ctx: ExecutionContext): string[] => {
  const req = ctx.switchToHttp().getRequest<ServiceAuthRequest>();
  return serviceIdentityFrom(req).permissions;
});
