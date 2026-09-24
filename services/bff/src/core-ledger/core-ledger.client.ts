import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformException } from '@damp/nest-platform';

/** The {error, code} shape core-ledger's own envelope carries (see
 * core-ledger/internal/api/handlers.go's fail()/badRequest(), which now go
 * through shared/go/platform.WriteError and also add a request_id bff
 * doesn't need to read — bff mints its own on the way back out). */
interface CoreLedgerError {
  error: string;
  code: string;
}

export interface RequestOptions {
  idempotencyKey?: string;
  query?: Record<string, string | undefined>;
}

/**
 * CoreLedgerClient is bff's only outbound dependency — see
 * docs/building-plan.md's "Build the BFF" decision: it owns no database and
 * every write forwards to exactly one owning service, never orchestrates.
 * Every method here is a thin HTTP call; translation from core-ledger's
 * snake_case/decimal-string shapes into bff's camelCase/Money response
 * shapes happens one layer up, in each feature's controller/service.
 */
@Injectable()
export class CoreLedgerClient {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    // Validated as a required, well-formed URL by BffConfig — non-null by
    // the time DI constructs anything downstream of PlatformConfigModule.
    this.baseUrl = config.get<string>('CORE_LEDGER_URL', { infer: true })!;
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  private async request<T>(method: string, path: string, body: unknown, options?: RequestOptions): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (options?.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, value);
        }
      }
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new PlatformException(
        502,
        'CORE_LEDGER_UNREACHABLE',
        `core-ledger request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      const parsed = await safeJson<CoreLedgerError>(response);
      throw new PlatformException(
        response.status,
        parsed?.code ?? 'CORE_LEDGER_ERROR',
        parsed?.error ?? `core-ledger returned ${response.status}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
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
