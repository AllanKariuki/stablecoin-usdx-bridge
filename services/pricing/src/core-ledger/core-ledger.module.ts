import { Global, Module } from '@nestjs/common';
import { ServiceTokenClient } from '@damp/nest-platform';
import { CoreLedgerClient } from './core-ledger.client';

// @Global for the same reason rms's is: one stateless client, wanted by
// the quotes flow only, and threading it through an import list buys
// nothing.
@Global()
@Module({
  providers: [CoreLedgerClient, ServiceTokenClient],
  exports: [CoreLedgerClient],
})
export class CoreLedgerModule {}
