import { Controller, Get, Param } from '@nestjs/common';
import { RequireServiceRole } from '@damp/nest-platform';
import { ProvisioningService } from './provisioning.service';

/**
 * Called directly by services/auth-proxy's IdentityHTTPResolver
 * (services/auth-proxy/internal/identityclient/resolver.go) and
 * notifications' WebSocket auth — never through Traefik/the gateway, which
 * is why this returns snake_case (matching that Go client's partyLookup
 * struct tags) rather than the camelCase every other identity route would
 * use. See infra/k8s/identity-networkpolicy.yaml, which restricts ingress to
 * exactly those callers. `subject` is the Keycloak `sub` claim.
 *
 * Since H3 the callers are also authenticated in-band: both carry a
 * service-account JWT holding identity.resolve, which is what
 * @RequireServiceRole declares below.
 */
@Controller('internal/parties')
export class InternalPartiesController {
  constructor(private readonly provisioning: ProvisioningService) {}

  @Get('by-subject/:subject')
  @RequireServiceRole('identity.resolve')
  async bySubject(@Param('subject') subject: string): Promise<{ party_id: string; org_id: string }> {
    const { partyId, orgId } = await this.provisioning.resolveBySubject(subject);
    return { party_id: partyId, org_id: orgId };
  }
}
