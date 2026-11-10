import { Module } from '@nestjs/common';
import { NotificationsProxyController } from './notifications.controller';
import { PaymentsProxyController } from './payments.controller';
import { ComplianceProxyController, KycProxyController, WorkflowProxyController } from './p5.controller';
import { UpstreamProxy } from './upstream.proxy';

@Module({
  controllers: [
    PaymentsProxyController,
    NotificationsProxyController,
    WorkflowProxyController,
    KycProxyController,
    ComplianceProxyController,
  ],
  providers: [UpstreamProxy],
})
export class UpstreamModule {}
