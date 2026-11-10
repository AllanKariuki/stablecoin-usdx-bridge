import { DynamicModule, Global, Module } from '@nestjs/common';
import { PlatformConfigModule, PlatformModule } from '@damp/nest-platform';
import { NotificationsConfig } from './config/notifications-config';
import { DbModule } from './db/db.module';
import { DeliveryService } from './delivery/delivery.service';
import { EmailTransport } from './delivery/email.transport';
import { IngestController } from './ingest/ingest.controller';
import { NotificationsController } from './notifications.controller';
import { WebhooksService } from './webhooks/webhooks.service';
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
  providers: [WsGateway, WsAuth, EmailTransport, WebhooksService, DeliveryService],
  exports: [WsGateway, WsAuth, DeliveryService],
})
export class NotificationsModule {}

export function createAppModule(version?: string, commit?: string): DynamicModule {
  return {
    module: AppModule,
    imports: [
      PlatformConfigModule.forRoot({ validationClass: NotificationsConfig }),
      PlatformModule.forRoot({ service: 'notifications', version, commit }),
      DbModule,
      NotificationsModule,
    ],
  };
}

@Module({})
export class AppModule {}
