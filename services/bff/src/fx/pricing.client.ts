import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformException, ServiceTokenClient } from '@damp/nest-platform';

/** services/pricing's {error, code} envelope (shared/go/platform). */
interface PricingError {
  error: string;
  code: string;
}

/**
 * bff's calls to services/pricing, the only issuer of FX quotes. The
 * browser-facing /rates proxies forward through UpstreamProxy (a
 * passthrough); POST /quotes needs the response read and reshaped, so it
 * goes through this client instead — same service-account bearer (svc-bff
 * holds pricing.quote), same 20s timeout, same error mapping.
 */
@Injectable()
export class PricingClient {
  private readonly baseUrl: string;

  constructor(
    config: ConfigService,
    private readonly serviceTokens: ServiceTokenClient,
  ) {
    this.baseUrl = config.get<string>('PRICING_URL', { infer: true }) ?? '';
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.baseUrl) {
      throw new PlatformException(
        503,
        'UPSTREAM_NOT_CONFIGURED',
        'this feature is not available: the service that owns it is not configured in this environment',
      );
    }

    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await this.serviceTokens.accessToken()}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new PlatformException(
        502,
        'PRICING_UNAVAILABLE',
        `the pricing service did not respond: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      const parsed = await safeJson<PricingError>(response);
      throw new PlatformException(
        response.status,
        parsed?.code ?? 'PRICING_ERROR',
        parsed?.error ?? `pricing returned ${response.status}`,
      );
    }
    return (await response.json()) as T;
  }
}

async function safeJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
