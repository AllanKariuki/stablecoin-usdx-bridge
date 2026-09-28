import { Global, Module } from '@nestjs/common';
import { CoreLedgerClient } from './core-ledger.client';

// @Global for the same reason bff's is: one stateless client, wanted by
// three unrelated feature modules, and threading it through every import
// list buys nothing.
@Global()
@Module({
  providers: [CoreLedgerClient],
  exports: [CoreLedgerClient],
})
export class CoreLedgerModule {}
