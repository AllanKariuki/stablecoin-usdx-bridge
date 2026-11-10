import { Global, Module } from '@nestjs/common';
import { NotificationsClient } from './notifications.client';

@Global()
@Module({
  providers: [NotificationsClient],
  exports: [NotificationsClient],
})
export class NotificationsModule {}
