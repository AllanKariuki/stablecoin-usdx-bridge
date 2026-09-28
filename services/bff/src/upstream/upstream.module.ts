import { Module } from '@nestjs/common';
import { NotificationsProxyController } from './notifications.controller';
import { PaymentsProxyController } from './payments.controller';
import { UpstreamProxy } from './upstream.proxy';

@Module({
  controllers: [PaymentsProxyController, NotificationsProxyController],
  providers: [UpstreamProxy],
})
export class UpstreamModule {}
