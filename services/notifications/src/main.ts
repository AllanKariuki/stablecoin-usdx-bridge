import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { PlatformHealthService, installGracefulShutdown } from '@damp/nest-platform';
import { createAppModule } from './app.module';
import { NotificationsConfig } from './config/notifications-config';
import { DbService } from './db/db.service';
import { WsAuth } from './ws/ws.auth';
import { WsGateway } from './ws/ws.gateway';

const version = process.env.BUILD_VERSION ?? 'dev';
const commit = process.env.BUILD_COMMIT ?? 'none';

async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(createAppModule(version, commit), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<NotificationsConfig, true>);
  const health = app.get(PlatformHealthService);
  const db = app.get(DbService);

  health.addCheck('database', () => db.ping());

  installGracefulShutdown(app, health, app.get(Logger));

  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  // The WebSocket server attaches to the same HTTP server Nest just bound, so
  // /ws and the REST surface share one port — which is what the frontend's
  // runtime-config.js assumes (ws://localhost:3000/ws alongside nothing else
  // on 3000).
  //
  // It attaches *after* listen() because the underlying server does not exist
  // until then.
  const gateway = app.get(WsGateway);
  const auth = app.get(WsAuth);
  gateway.authenticate = (req) => auth.resolve(req);
  gateway.attach(app.getHttpServer());

  app.get(Logger).log(`notifications listening on :${port} (websocket at /ws)`);
}

main().catch((err) => {
  process.stderr.write(`notifications failed to boot: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
