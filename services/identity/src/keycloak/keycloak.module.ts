import { Global, Module } from '@nestjs/common';
import { ServiceTokenClient } from '@damp/nest-platform';
import { KeycloakAdminClient } from './keycloak-admin.client';

// ServiceTokenClient is provided here AND in CoreLedgerModule; both modules
// are @Global, so Nest resolves one shared instance and both clients use
// the same client-credentials cache.
@Global()
@Module({
  providers: [KeycloakAdminClient, ServiceTokenClient],
  exports: [KeycloakAdminClient],
})
export class KeycloakModule {}
