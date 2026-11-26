import { HttpStatus } from '@nestjs/common';
import { PlatformException } from '../errors/platform.exception';
import type { ServiceAuthRequest } from './service-auth.guard';

/**
 * serviceIdentityFrom is the one place a Node service reads the end-user
 * identity headers (X-User-Id/X-Org-Id/X-Roles/X-Permissions) after H3.
 *
 * Before H3 those headers were trusted on the strength of the network: Traefik
 * strips them inbound and only auth-proxy (via bff) sets them. H3 removes that
 * assumption — the cluster network is flat, so the headers are only as good as
 * the caller, and the caller is only as good as its token. This function
 * therefore refuses to read them at all unless ServiceAuthGuard verified a
 * token whose resource_access carries `${audience}.user-proxy` for this
 * service's own resource client — the role granted to svc-bff and nothing
 * else. A caller with any other role (an ingest relay, a proposer) must not be
 * able to assert an end-user identity, even if it can reach a user-facing
 * route.
 */

export interface ServiceIdentity {
  /** X-User-Id — the party id auth-proxy resolved. */
  userId: string;
  /** X-Org-Id, when the user belongs to an organization. */
  orgId: string;
  /** X-Roles, comma-split the way auth-proxy writes it. */
  roles: string[];
  /** X-Permissions, comma-split. */
  permissions: string[];
}

export interface ServiceIdentityOptions {
  /** When false, a missing/empty X-User-Id yields '' instead of a 401
   * (rms's Actor semantics: an unattributed change is recorded as
   * UNATTRIBUTED rather than refused). Defaults to true. */
  userIdRequired?: boolean;
}

/** splitHeader is auth-proxy's comma-join split, trimmed and de-blanked so an
 * empty header is no entries rather than one entry named "". */
function splitHeader(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '');
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

export function serviceIdentityFrom(
  req: ServiceAuthRequest,
  options: ServiceIdentityOptions = {},
): ServiceIdentity {
  const claims = req.serviceClaims;
  if (!claims) {
    throw new PlatformException(
      HttpStatus.UNAUTHORIZED,
      'UNAUTHENTICATED',
      'no verified service token on this request',
    );
  }

  // The user-proxy gate: only a caller holding `${audience}.user-proxy` on
  // this service's own resource client may assert identity headers. The
  // audience the guard verified against is the resource client these roles
  // live on.
  const audience = req.serviceAudience ?? '';
  if (!audience || !claims.clientRoles[audience]?.includes(`${audience}.user-proxy`)) {
    throw new PlatformException(
      HttpStatus.UNAUTHORIZED,
      'MISSING_IDENTITY',
      'the caller is not authorized to assert end-user identity headers',
    );
  }

  const userId = single(req.headers['x-user-id']);
  if (options.userIdRequired !== false && userId === '') {
    throw new PlatformException(
      HttpStatus.UNAUTHORIZED,
      'MISSING_IDENTITY',
      'X-User-Id header missing — is this request going through the gateway?',
    );
  }

  return {
    userId,
    orgId: single(req.headers['x-org-id']),
    roles: splitHeader(req.headers['x-roles']),
    permissions: splitHeader(req.headers['x-permissions']),
  };
}

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}
