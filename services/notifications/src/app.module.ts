import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PlatformConfigModule, PlatformModule, ServiceAuthGuard, ServiceTokenClient } from '@damp/nest-platform';
import { NotificationsConfig } from './config/notifications-config';
import { DbModule } from './db/db.module';
import { DeliveryService } from './delivery/delivery.service';
import { EmailTransport } from './delivery/email.transport';
import { IngestController } from './ingest/ingest.controller';
import { OutboxConsumer } from './ingest/outbox-consumer';
import { OutboxHandler } from './ingest/outbox-handler';
import { NatsService } from './nats/nats.service';
import { NotificationsController } from './notifications.controller';
import { WebhooksService } from './webhooks/webhooks.service';
import { LiveFanout } from './ws/live-fanout';
import { WsAuth } from './ws/ws.auth';
import { WsGateway } from './ws/ws.gateway';

/**
 * One module. This service is small enough that splitting it into six would
 * add import graphs without adding boundaries — every piece here is used by
 * the delivery path and nothing else.
 */
@Global()
@Module({
  controllers: [NotificationsController, IngestController],
  providers: [
    NatsService,
    WsGateway,
    LiveFanout,
    WsAuth,
    EmailTransport,
    WebhooksService,
    DeliveryService,
    OutboxHandler,
    OutboxConsumer,
    // WsAuth calls identity's /internal/parties/by-subject with
    // notifications' own service token (identity.resolve).
    ServiceTokenClient,
  ],
  exports: [WsGateway, LiveFanout, WsAuth, DeliveryService],
})
export class NotificationsModule {}

export function createAppModule(version?: string, commit?: string): DynamicModule {
  return {
    module: AppModule,
    imports: [
      PlatformConfigModule.forRoot({ validationClass: NotificationsConfig }),
      // Global so NotificationsModule's providers can inject
      // PlatformMetricsService: OutboxConsumer's counter goes in the registry
      // /metrics serves. Without it the @Optional() injection quietly
      // resolves to nothing and the poison-message counter is never scraped.
      { ...PlatformModule.forRoot({ service: 'notifications', version, commit }), global: true },
      DbModule,
      NotificationsModule,
    ],
    providers: [
      // H3: every route carries a Keycloak service-account JWT whose audience
      // is the `notifications` resource client. Default role is
      // notifications.user-proxy (svc-bff); the two ingest routes declare
      // notifications.ingest.
      { provide: APP_GUARD, useClass: ServiceAuthGuard },
    ],
  };
}

@Module({})
export class AppModule {}
