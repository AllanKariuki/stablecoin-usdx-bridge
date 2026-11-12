import { Global, Module } from '@nestjs/common';
import { OutboxRelay } from './outbox.relay';
import { OutboxRepository } from './outbox.repository';

// @Global for the same reason DbModule is: settlement and invoices both write
// events, and neither should need to know the other does.
@Global()
@Module({
  providers: [OutboxRepository, OutboxRelay],
  exports: [OutboxRepository, OutboxRelay],
})
export class OutboxModule {}
