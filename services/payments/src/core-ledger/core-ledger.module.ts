import { Global, Module } from '@nestjs/common';
import { ServiceTokenClient } from '@damp/nest-platform';
import { CoreLedgerClient } from './core-ledger.client';

@Global()
@Module({
  providers: [CoreLedgerClient, ServiceTokenClient],
  exports: [CoreLedgerClient],
})
export class CoreLedgerModule {}
