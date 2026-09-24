import { Global, Module } from '@nestjs/common';
import { CoreLedgerClient } from './core-ledger.client';

// @Global since every feature module needs it and it's stateless/config-
// only — the same reasoning PlatformModule's own sub-modules use.
@Global()
@Module({
  providers: [CoreLedgerClient],
  exports: [CoreLedgerClient],
})
export class CoreLedgerModule {}
