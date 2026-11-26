import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditRelay, HttpAuditPublisher, PlatformMetricsService } from '@damp/nest-platform';
import { DbService } from '../db/db.service';

/**
 * Drains this service's audit_outbox to services/audit-trail.
 *
 * Started on bootstrap rather than module init so DbService's migrations —
 * which create the table — have already run. Without AUDIT_TRAIL_URL it
 * does not start, and that is a supported state rather than a lossy one:
 * every event is already committed with its action and waits.
 */
@Injectable()
export class AuditRelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('AuditRelay');
  private relay: AuditRelay | null = null;

  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService,
    @Optional() private readonly metrics?: PlatformMetricsService,
  ) {}

  onApplicationBootstrap(): void {
    const url = this.config.get<string>('AUDIT_TRAIL_URL') ?? '';
    if (!url) {
      this.logger.warn('AUDIT_TRAIL_URL is not set; audit events accumulate in audit_outbox until it is');
      return;
    }
    this.relay = new AuditRelay(
      this.db,
      new HttpAuditPublisher(url, this.config.get<string>('AUDIT_TRAIL_TOKEN') ?? ''),
      this.logger,
      { registry: this.metrics?.registry },
    );
    this.relay.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.relay?.stop();
  }
}
