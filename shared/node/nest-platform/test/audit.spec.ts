import { Registry } from 'prom-client';
import {
  AuditRelay,
  enqueueAuditEvent,
  fullJitter,
  HttpAuditPublisher,
  InvalidAuditEventError,
  PendingAuditEvent,
  PermanentAuditError,
  Queryable,
} from '../src';
import { auditRequestFrom } from '../src/audit/audit-request';

/**
 * Unit tests: the wire shape, the refusal rules and the relay's
 * retry/dead-letter decisions. The claim itself (SKIP LOCKED) and the
 * same-transaction guarantee are Postgres properties and are tested against
 * real Postgres in each producer's suite (services/workflow's
 * audit-outbox.e2e-spec.ts) and in shared/go/platform/audit.
 */

class RecordingClient implements Queryable {
  calls: Array<{ text: string; params?: unknown[] }> = [];
  constructor(private readonly respond: (text: string) => Array<Record<string, unknown>> = () => []) {}
  async query(text: string, params?: unknown[]) {
    this.calls.push({ text, params });
    return { rows: this.respond(text) };
  }
}

describe('enqueueAuditEvent', () => {
  it('writes the snake_case wire shape with a minted id and the request facts', async () => {
    const client = new RecordingClient();
    const id = await enqueueAuditEvent(
      client,
      {
        actor: 'checker-1',
        action: 'workflow.request.approved',
        service: 'workflow',
        subjectType: 'APPROVAL_REQUEST',
        subjectId: 'req_1',
        afterState: { status: 'APPROVED' },
        occurredAt: new Date('2026-11-12T07:00:00.123Z'),
      },
      { requestId: 'gw-1', sourceIp: '203.0.113.9', roles: ['approver'] },
    );

    expect(client.calls).toHaveLength(1);
    const [eventId, action, payload] = client.calls[0].params as [string, string, string];
    expect(eventId).toBe(id);
    expect(action).toBe('workflow.request.approved');
    expect(JSON.parse(payload)).toEqual({
      id,
      actor: 'checker-1',
      actor_roles: ['approver'],
      action: 'workflow.request.approved',
      subject_type: 'APPROVAL_REQUEST',
      subject_id: 'req_1',
      service: 'workflow',
      outcome: 'SUCCESS',
      after_state: { status: 'APPROVED' },
      request_id: 'gw-1',
      source_ip: '203.0.113.9',
      occurred_at: '2026-11-12T07:00:00.123Z',
    });
  });

  it('prefers the roles the caller computed over the header', async () => {
    const client = new RecordingClient();
    await enqueueAuditEvent(
      client,
      { actor: 'a', action: 'x.y.z', service: 's', actorRoles: ['compliance_officer'] },
      { roles: ['customer'] },
    );
    expect(JSON.parse((client.calls[0].params as string[])[2]).actor_roles).toEqual(['compliance_officer']);
  });

  it('refuses, before writing, an event audit-trail would refuse', async () => {
    const client = new RecordingClient();
    await expect(enqueueAuditEvent(client, { actor: '', action: 'x', service: 's' })).rejects.toThrow(
      InvalidAuditEventError,
    );
    await expect(enqueueAuditEvent(client, { actor: 'a', action: ' ', service: 's' })).rejects.toThrow(
      InvalidAuditEventError,
    );
    await expect(enqueueAuditEvent(client, { actor: 'a', action: 'x', service: '' })).rejects.toThrow(
      InvalidAuditEventError,
    );
    expect(client.calls).toHaveLength(0);
  });
});

describe('auditRequestFrom', () => {
  it('reads the gateway headers, preferring the first forwarded hop', () => {
    const req = {
      id: 'pino-id',
      ip: '10.0.0.1',
      headers: {
        'x-forwarded-for': '198.51.100.7, 10.0.0.1',
        'x-roles': 'ops, finance',
        'user-agent': 'ua',
      },
    } as unknown as Parameters<typeof auditRequestFrom>[0];
    expect(auditRequestFrom(req)).toEqual({
      requestId: 'pino-id',
      sourceIp: '198.51.100.7',
      userAgent: 'ua',
      roles: ['ops', 'finance'],
    });
  });
});

describe('HttpAuditPublisher', () => {
  const event: PendingAuditEvent = { id: '1', eventId: 'ev-1', action: 'a', payload: '{}', attempts: 1 };

  function publisherReturning(status: number) {
    const seen: { url?: string; init?: RequestInit } = {};
    const fetchImpl = async (url: string, init: RequestInit) => {
      seen.url = url;
      seen.init = init;
      return new Response('nope', { status });
    };
    return { publisher: new HttpAuditPublisher('http://audit-trail:8085/', 's3cret', fetchImpl), seen };
  }

  it.each([201, 200])('treats %i as delivered (recorded, or already recorded)', async (status) => {
    const { publisher, seen } = publisherReturning(status);
    await expect(publisher.publish(event)).resolves.toBeUndefined();
    expect(seen.url).toBe('http://audit-trail:8085/internal/events');
    expect((seen.init!.headers as Record<string, string>).authorization).toBe('Bearer s3cret');
    expect((seen.init!.headers as Record<string, string>)['idempotency-key']).toBe('ev-1');
  });

  it.each([400, 401, 409])('treats %i as a permanent refusal', async (status) => {
    const { publisher } = publisherReturning(status);
    await expect(publisher.publish(event)).rejects.toBeInstanceOf(PermanentAuditError);
  });

  it.each([408, 429, 500, 503])('treats %i as transient', async (status) => {
    const { publisher } = publisherReturning(status);
    const err = await publisher.publish(event).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentAuditError);
  });
});

describe('AuditRelay', () => {
  const quiet = { log: () => undefined, warn: () => undefined, error: () => undefined };

  it('delivers, reschedules transient failures without a budget, and dead-letters refusals', async () => {
    const claimed = [
      { id: 1, event_id: 'ok', action: 'a', payload: '{}', attempts: 1 },
      { id: 2, event_id: 'down', action: 'a', payload: '{}', attempts: 57 },
      { id: 3, event_id: 'refused', action: 'a', payload: '{}', attempts: 1 },
    ];
    const db = new RecordingClient((text) => {
      if (text.includes('RETURNING id, event_id')) return claimed;
      if (text.includes('count(*)')) return [{ n: 3 }];
      return [];
    });
    const publisher = {
      target: 'test',
      async publish(e: PendingAuditEvent) {
        if (e.eventId === 'down') throw new Error('ECONNREFUSED');
        if (e.eventId === 'refused') throw new PermanentAuditError(400, 'actor and action are required');
      },
    };
    const registry = new Registry();
    const relay = new AuditRelay(db, publisher, quiet, { registry, backoffMinMs: 1000, backoffMaxMs: 60_000 });

    await expect(relay.runOnce()).resolves.toBe(1);

    const updates = db.calls.filter((c) => c.text.trim().startsWith('UPDATE audit_outbox SET') && !c.text.includes('attempts = attempts + 1'));
    expect(updates.find((u) => u.text.includes("'DELIVERED'"))?.params).toEqual(['1']);
    // 57 attempts and still rescheduled, never dead: an audit-trail outage
    // must not become a hole in the trail.
    const resched = updates.find((u) => u.text.includes('next_attempt_at'));
    expect(resched?.params?.[0]).toBe('2');
    expect(resched?.params?.[1]).toBeGreaterThan(0);
    expect(resched?.params?.[1]).toBeLessThanOrEqual(60);
    expect(updates.find((u) => u.text.includes("'DEAD'"))?.params?.[0]).toBe('3');

    const metrics = await registry.metrics();
    expect(metrics).toContain('audit_outbox_pending_events 3');
    expect(metrics).toContain('audit_outbox_dead_lettered_total 1');
  });
});

describe('fullJitter', () => {
  it('stays within (0, max]', () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const ms = fullJitter(1000, 60_000, attempt);
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(60_000);
    }
  });
});
