import { Global, Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesRepository } from './invoices.repository';

@Global()
@Module({
  controllers: [InvoicesController],
  providers: [InvoicesRepository],
  exports: [InvoicesRepository],
})
export class InvoicesModule {}
