import { Global, Module } from '@nestjs/common';
import { ServiceTokenClient } from '@damp/nest-platform';
import { CoreLedgerClient } from './core-ledger.client';

// ServiceTokenClient is provided here AND in KeycloakModule. Both are
// @Global, so the module graph keeps exactly one instance per process —
// whichever of the two Nest instantiates first wins, and both clients share
// that one client-credentials cache.
@Global()
@Module({
  providers: [CoreLedgerClient, ServiceTokenClient],
  exports: [CoreLedgerClient],
})
export class CoreLedgerModule {}
