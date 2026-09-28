import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from './auth/current-user.decorator';
import { DbService } from './db/db.service';
import { WebhooksService } from './webhooks/webhooks.service';
import { WsGateway } from './ws/ws.gateway';

/**
 * The customer-facing read surface: what was I told, what do I still want to
 * be told, and who else should be told programmatically.
 */
@Controller()
export class NotificationsController {
  constructor(
    private readonly db: DbService,
    private readonly webhooks: WebhooksService,
    private readonly ws: WsGateway,
  ) {}

  @Get('notifications')
  async list(@CurrentUser() partyId: string, @Query('unread') unread?: string) {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT id, event, subject, body, severity, payload, created_at, read_at
         FROM deliveries
        WHERE party_id = $1 AND channel = 'IN_APP' AND status = 'SENT'
          AND ($2::bool IS NOT TRUE OR read_at IS NULL)
        ORDER BY created_at DESC LIMIT 100`,
      [partyId, unread === 'true'],
    );

    const { rows: counts } = await this.db.query<{ count: string }>(
      `SELECT count(*) FROM deliveries
        WHERE party_id = $1 AND channel = 'IN_APP' AND status = 'SENT' AND read_at IS NULL`,
      [partyId],
    );

    return {
      notifications: rows.map((r) => ({
        id: r.id,
        event: r.event,
        title: r.subject,
        message: r.body,
        severity: r.severity,
        data: r.payload,
        read: r.read_at !== null,
        createdAt: r.created_at.toISOString(),
      })),
      unreadCount: Number(counts[0].count),
    };
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  async markRead(@CurrentUser() partyId: string, @Param('id') id: string) {
    const { rows } = await this.db.query<{ id: string }>(
      `UPDATE deliveries SET read_at = now()
        WHERE id = $1 AND party_id = $2 AND read_at IS NULL RETURNING id`,
      [id, partyId],
    );
    if (!rows[0]) throw new NotFoundException('no such unread notification');
    return { id, read: true };
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  async markAllRead(@CurrentUser() partyId: string) {
    const { rows } = await this.db.query<{ id: string }>(
      `UPDATE deliveries SET read_at = now()
        WHERE party_id = $1 AND channel = 'IN_APP' AND read_at IS NULL RETURNING id`,
      [partyId],
    );
    return { marked: rows.length };
  }

  @Get('notification-preferences')
  async preferences(@CurrentUser() partyId: string) {
    const { rows } = await this.db.query<Record<string, any>>(
      'SELECT event, channel, enabled FROM preferences WHERE party_id = $1',
      [partyId],
    );
    // Only explicit overrides are returned, because that is all that exists:
    // absence means enabled, and materialising a full default set would turn
    // "never configured" into rows that then have to be migrated whenever a
    // new event is added.
    return { overrides: rows, note: 'Anything not listed here is enabled; absence means enabled.' };
  }

  @Put('notification-preferences')
  async setPreference(
    @CurrentUser() partyId: string,
    @Body() body: { event: string; channel: string; enabled: boolean },
  ) {
    await this.db.query(
      `INSERT INTO preferences (party_id, event, channel, enabled) VALUES ($1,$2,$3,$4)
       ON CONFLICT (party_id, event, channel) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
      [partyId, body.event, body.channel, body.enabled],
    );
    return { event: body.event, channel: body.channel, enabled: body.enabled };
  }

  // --- Webhooks -----------------------------------------------------------

  @Get('webhooks')
  async listWebhooks(@CurrentUser() partyId: string) {
    return { endpoints: await this.webhooks.list(partyId) };
  }

  @Post('webhooks')
  async createWebhook(@CurrentUser() partyId: string, @Body() body: { url: string; events?: string[] }) {
    if (!body?.url?.startsWith('https://') && !body?.url?.startsWith('http://localhost')) {
      // http:// is refused except on localhost. A webhook carries signed
      // payloads about a customer's money over the open internet, and a
      // signature does not make plaintext private.
      throw new NotFoundException('webhook URLs must be https (http is allowed only for localhost)');
    }
    const created = await this.webhooks.register(partyId, body.url, body.events ?? []);
    return {
      id: created.id,
      url: body.url,
      events: body.events ?? [],
      // Shown exactly once. A signing secret that can be re-read from an API
      // proves nothing, because anyone who can read it can forge the
      // signature.
      secret: created.secret,
      note: 'Store this secret now — it is not retrievable again. Verify X-DAMP-Signature as t=<unix>,v1=<hmac-sha256 of "<t>.<body>">.',
    };
  }

  @Delete('webhooks/:id')
  async deleteWebhook(@CurrentUser() partyId: string, @Param('id') id: string) {
    const removed = await this.webhooks.remove(partyId, id);
    if (!removed) throw new NotFoundException('no such webhook endpoint');
    return { id, deleted: true };
  }

  /** Operational visibility: how many sockets this replica is fanning out to. */
  @Get('ws-status')
  wsStatus() {
    return { connections: this.ws.connectionCount() };
  }
}
