import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ServiceAuthRequest } from './service-auth.guard';
import { serviceIdentityFrom, ServiceIdentity, ServiceIdentityOptions } from './service-identity';

/**
 * CurrentUser is the shared end-user identity decorator: the full context
 * auth-proxy resolved (X-User-Id/X-Org-Id/X-Roles/X-Permissions), readable
 * only when the request's verified service token holds this service's
 * `user-proxy` client role — see serviceIdentityFrom for why.
 *
 * A service whose handlers want a narrower shape (payments wants the bare
 * user id; workflow wants {userId, roles}) keeps its own decorator as a thin
 * wrapper over serviceIdentityFrom so the gate lives in exactly one place.
 */
export const CurrentUser = createParamDecorator(
  (options: ServiceIdentityOptions = {}, ctx: ExecutionContext): ServiceIdentity => {
    const req = ctx.switchToHttp().getRequest<ServiceAuthRequest>();
    return serviceIdentityFrom(req, options);
  },
);
