import { Controller, Get, Param } from '@nestjs/common';
import { ProvisioningService } from './provisioning.service';

/**
 * Called directly by services/auth-proxy's IdentityHTTPResolver
 * (services/auth-proxy/internal/identityclient/resolver.go) — never
 * through Traefik/the gateway, which is why this returns snake_case
 * (matching that Go client's partyLookup struct tags) rather than the
 * camelCase every other identity route would use. See
 * infra/k8s/identity-networkpolicy.yaml, which restricts ingress to
 * exactly the auth-proxy pod. `subject` is the Keycloak `sub` claim.
 */
@Controller('internal/parties')
export class InternalPartiesController {
  constructor(private readonly provisioning: ProvisioningService) {}

  @Get('by-subject/:subject')
  async bySubject(@Param('subject') subject: string): Promise<{ party_id: string; org_id: string }> {
    const { partyId, orgId } = await this.provisioning.resolveBySubject(subject);
    return { party_id: partyId, org_id: orgId };
  }
}
