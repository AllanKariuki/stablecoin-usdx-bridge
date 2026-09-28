import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

/**
 * payments' environment surface. Field names double as env var names — see
 * services/rms/src/config/rms-config.ts and shared/go/platform/config.go for
 * the same pattern in both languages.
 */
export class PaymentsConfig {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3003; // per docs/building-plan.md's port map

  @IsString()
  @IsIn(['debug', 'info', 'warn', 'error'])
  LOG_LEVEL = 'info';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // Every intent that settles does so by calling core-ledger. payments owns
  // no balance.
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  CORE_LEDGER_URL!: string;

  @IsString()
  CORE_LEDGER_SERVICE_TOKEN = '';

  // Best-effort, and empty is fine: a notification that fails to send must
  // never fail a settlement that already happened.
  @IsString()
  NOTIFICATIONS_URL = '';

  // Where payment links point. Not the API base — a link goes in an email and
  // is opened in a browser.
  @IsString()
  PUBLIC_APP_URL = 'http://localhost:5173';

  // --- M-Pesa (Daraja sandbox) ---
  //
  // Chosen because it is free and self-service, which is the plan's test for
  // whether a real integration belongs in a phase at all. Unconfigured is a
  // normal state: RailRegistry falls back to the stub and says so.
  @IsUrl({ require_tld: false })
  MPESA_BASE_URL = 'https://sandbox.safaricom.co.ke';

  @IsOptional()
  @IsString()
  MPESA_CONSUMER_KEY = '';

  @IsOptional()
  @IsString()
  MPESA_CONSUMER_SECRET = '';

  @IsOptional()
  @IsString()
  MPESA_SHORTCODE = '';

  @IsOptional()
  @IsString()
  MPESA_PASSKEY = '';

  // Must be publicly reachable for Daraja to POST to it — an ngrok tunnel in
  // local development. An unreachable callback URL is the single most common
  // reason an STK push appears to hang forever.
  @IsOptional()
  @IsString()
  MPESA_CALLBACK_URL = '';

  @Type(() => Boolean)
  @IsBoolean()
  STUB_RAIL_ENABLED = true;
}
