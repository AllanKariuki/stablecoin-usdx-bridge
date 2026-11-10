import { Global, Module } from '@nestjs/common';
import { CoreLedgerClient } from './core-ledger.client';

@Global()
@Module({
  providers: [CoreLedgerClient],
  exports: [CoreLedgerClient],
})
export class CoreLedgerModule {}
