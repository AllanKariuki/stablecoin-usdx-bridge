import { Global, Module } from '@nestjs/common';
import { ServiceTokenClient } from '@damp/nest-platform';
import { CoreLedgerClient } from './core-ledger.client';

@Global()
@Module({
  providers: [CoreLedgerClient, ServiceTokenClient],
  // ServiceTokenClient is exported too: the outbox relay authenticates to
  // notifications with the same svc-payments token cache.
  exports: [CoreLedgerClient, ServiceTokenClient],
})
export class CoreLedgerModule {}
