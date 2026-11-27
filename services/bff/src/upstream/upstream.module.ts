import { Module } from '@nestjs/common';
import { NotificationsProxyController } from './notifications.controller';
import { PaymentsProxyController } from './payments.controller';
import { ComplianceProxyController, KycProxyController, WorkflowProxyController } from './p5.controller';
import { AuditTrailProxyController, ReportingProxyController } from './p7.controller';
import { CoreLedgerOperationsProxyController, RmsProxyController } from './operations.controller';
import { PricingProxyController } from './pricing.controller';
import { UpstreamProxy } from './upstream.proxy';

// ServiceTokenClient is not listed here: core-ledger.module.ts is @Global
// and exports the one shared instance (same cached token for the
// core-ledger client and every upstream proxy).
@Module({
  controllers: [
    PaymentsProxyController,
    NotificationsProxyController,
    WorkflowProxyController,
    KycProxyController,
    ComplianceProxyController,
    ReportingProxyController,
    AuditTrailProxyController,
    RmsProxyController,
    CoreLedgerOperationsProxyController,
    PricingProxyController,
  ],
  providers: [UpstreamProxy],
})
export class UpstreamModule {}
