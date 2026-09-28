import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express-serve-static-core';
import { UpstreamProxy } from './upstream.proxy';

/**
 * services/notifications' HTTP surface.
 *
 * The WebSocket is deliberately NOT proxied: the frontend connects straight
 * to ws://localhost:3000/ws, which is what runtime-config.js has always
 * declared. Proxying a long-lived socket through the BFF would put a second
 * process in the path of every message for no gain, and the upgrade is
 * authenticated at its own end (see services/notifications/src/ws/ws.auth.ts,
 * and why it has to be).
 */
@Controller()
export class NotificationsProxyController {
  private readonly baseUrl: string;

  constructor(
    private readonly proxy: UpstreamProxy,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('NOTIFICATIONS_URL', { infer: true }) ?? '';
  }

  @All(['notifications', 'notifications/*path'])
  notifications(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }

  @All(['notification-preferences'])
  preferences(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }

  @All(['webhooks', 'webhooks/*path'])
  webhooks(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward(this.baseUrl, req, res);
  }
}
