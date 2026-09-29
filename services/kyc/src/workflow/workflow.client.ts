import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export interface ProposedRequest {
  id: string;
  status: string;
  payloadDigest: string;
}

/**
 * The maker-checker client.
 *
 * `digest` is a **local reimplementation** of services/workflow's
 * `payloadDigest`, and that is deliberate rather than laziness about sharing
 * code. The whole value of the scheme is that this service verifies an
 * approval independently: if it asked workflow to compute the digest it is
 * checking against, a compromised workflow service could answer with whatever
 * digest made its forged approval verify.
 *
 * The cost is that the two encodings must agree, and a drift between them
 * would make every approval fail verification at once. That is why
 * workflow exposes `POST /approval-requests/digest` — so this service's tests
 * can assert the two match rather than discovering they don't in production.
 */
@Injectable()
export class WorkflowClient {
  private readonly logger = new Logger(WorkflowClient.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('WORKFLOW_URL', { infer: true }) ?? '';
  }

  async propose(input: {
    action: string;
    subjectType: string;
    subjectId: string;
    payload: unknown;
    summary?: Record<string, unknown>;
    requestedBy: string;
    reason?: string;
  }): Promise<ProposedRequest | null> {
    if (!this.baseUrl) {
      this.logger.error('WORKFLOW_URL is unset: nothing can be approved in this environment');
      return null;
    }
    try {
      const res = await fetch(new URL('/approval-requests', this.baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': input.requestedBy },
        body: JSON.stringify({
          ...input,
          // Where the decision comes back. workflow retries until it lands.
          callbackUrl: `${this.selfUrl}/internal/approvals/callback`,
        }),
      });
      if (!res.ok) {
        this.logger.error(`workflow returned ${res.status} opening an approval for ${input.subjectId}`);
        return null;
      }
      return (await res.json()) as ProposedRequest;
    } catch (err) {
      this.logger.error(
        `workflow unreachable opening an approval for ${input.subjectId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  private selfUrl = process.env.SELF_URL ?? 'http://localhost:3007';

  /** Mirrors services/workflow/src/requests/digest.ts exactly. */
  digest(payload: unknown): string {
    return `sha256:${createHash('sha256').update(canonicalize(payload), 'utf8').digest('hex')}`;
  }
}

export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'number' || type === 'boolean' || type === 'string') return JSON.stringify(value);
  if (type === 'undefined' || type === 'function') return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (type === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}
