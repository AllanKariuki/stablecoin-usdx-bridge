import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class NotificationsConfig {
  /**
   * 3000, not a port of this service's choosing.
   *
   * frontend/public/runtime-config.js declares
   * VITE_APP_WEBSOCKET_URL = ws://localhost:3000/ws, and the frontend was
   * written against it before this service existed. That is also why Grafana
   * sits on 53000 — see the plan's port map, where 3000 is reserved for
   * exactly this.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsIn(['debug', 'info', 'warn', 'error'])
  LOG_LEVEL = 'info';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  /**
   * Keycloak's realm issuer, for verifying the token on a WebSocket upgrade.
   *
   * The upgrade cannot go through Traefik's ForwardAuth the way an HTTP
   * request does — a browser cannot set headers on `new WebSocket()` — so the
   * token arrives as a query parameter and is verified here. Empty disables
   * verification, which is only acceptable in local development and is logged
   * loudly at boot.
   */
  @IsOptional()
  @IsString()
  KEYCLOAK_ISSUER_URL = '';

  @IsString()
  OIDC_AUDIENCE = 'damp-portal';

  /**
   * identity, to map a Keycloak subject to the party id every other service
   * uses. Without it the subject is passed through — the same fallback
   * auth-proxy shipped with.
   */
  @IsOptional()
  @IsString()
  IDENTITY_SERVICE_URL = '';

  // --- SMTP. Mailpit locally: :58025 web UI, 1025 SMTP. ---
  @IsOptional()
  @IsString()
  SMTP_HOST = '';

  @Type(() => Number)
  @IsInt()
  SMTP_PORT = 1025;

  @Type(() => Boolean)
  @IsBoolean()
  SMTP_SECURE = false;

  @IsOptional()
  @IsString()
  SMTP_USER = '';

  @IsOptional()
  @IsString()
  SMTP_PASSWORD = '';

  @IsString()
  SMTP_FROM = 'DAMP <no-reply@damp.local>';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  WEBHOOK_DRAIN_SECONDS = 10;
}
