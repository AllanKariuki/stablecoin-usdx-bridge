import { Global, Module } from '@nestjs/common';
import { IntentsModule } from '../intents/intents.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesRepository } from './invoices.repository';

// IntentsModule is imported because paying an invoice creates an intent and
// settles it — InvoicesController injects IntentsService and SettlementService,
// which IntentsModule exports but does not make global. Without this the app
// failed to boot with an unresolved IntentsService.
@Global()
@Module({
  imports: [IntentsModule],
  controllers: [InvoicesController],
  providers: [InvoicesRepository],
  exports: [InvoicesRepository],
})
export class InvoicesModule {}
