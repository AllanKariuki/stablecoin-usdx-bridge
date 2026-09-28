import { Injectable, Logger } from '@nestjs/common';
import { PlatformException } from '@damp/nest-platform';
import type { Request, Response } from 'express-serve-static-core';

/**
 * Forwarding a request to the service that owns it.
 *
 * The BFF's rule from the plan is that it "owns no database, and a write
 * forwards to exactly one owning service — never orchestrates". These routes
 * are the pure form of that: payments owns payment intents and notifications
 * owns notifications, so the BFF's whole job for them is to be the one origin
 * the browser talks to and to carry the identity auth-proxy resolved.
 *
 * It is a forward, not a redirect: the browser must never learn that
 * payments exists on :3003, both because those services are not published and
 * because a redirect would drop the gateway's identity headers.
 *
 * Nothing is aggregated or reshaped here. The upstream services already emit
 * camelCase and the Money shape (see services/payments/src/money/money.ts),
 * so a translation layer would be a second place for the two to disagree.
 */
@Injectable()
export class UpstreamProxy {
  private readonly logger = new Logger(UpstreamProxy.name);

  async forward(baseUrl: string, req: Request, res: Response, pathOverride?: string): Promise<void> {
    if (!baseUrl) {
      throw new PlatformException(
        503,
        'UPSTREAM_NOT_CONFIGURED',
        'this feature is not available: the service that owns it is not configured in this environment',
      );
    }

    const target = new URL(pathOverride ?? req.originalUrl.replace(/^\/api/, ''), baseUrl);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // The identity auth-proxy resolved. Forwarding it is the entire reason
    // the upstream can trust its own X-User-Id — see the CurrentUser
    // decorator's note on why Traefik strips these from inbound requests.
    for (const name of ['x-user-id', 'x-org-id', 'x-roles', 'x-permissions', 'x-request-id', 'idempotency-key']) {
      const value = req.headers[name];
      if (typeof value === 'string') headers[name] = value;
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE';

    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
        signal: AbortSignal.timeout(20_000),
      });

      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
      res.send(text);
    } catch (err) {
      // A 502, not a 500: the BFF is fine, the thing behind it is not, and
      // the distinction is what tells an operator which service to look at.
      this.logger.error(
        `forwarding ${req.method} ${target.pathname} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new PlatformException(502, 'UPSTREAM_UNAVAILABLE', `the service behind ${target.pathname} did not respond`);
    }
  }
}
