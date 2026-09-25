import { Global, Module } from '@nestjs/common';
import { KeycloakAdminClient } from './keycloak-admin.client';

@Global()
@Module({
  providers: [KeycloakAdminClient],
  exports: [KeycloakAdminClient],
})
export class KeycloakModule {}
