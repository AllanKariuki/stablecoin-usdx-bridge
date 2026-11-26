import { Global, Module } from '@nestjs/common';
import { ServiceTokenClient } from '@damp/nest-platform';
import { CoreLedgerClient } from './core-ledger.client';

// @Global since every feature module needs it and it's stateless/config-
// only — the same reasoning PlatformModule's own sub-modules use.
// ServiceTokenClient is provided here (and exported) so the upstream
// operations proxy that forwards to core-ledger uses the same cached token
// this client does.
@Global()
@Module({
  providers: [CoreLedgerClient, ServiceTokenClient],
  exports: [CoreLedgerClient, ServiceTokenClient],
})
export class CoreLedgerModule {}
