import { AddressInfo } from 'node:net';
import { createServer, Server } from 'node:http';
import { WebSocket } from 'ws';
import { NatsService } from '../src/nats/nats.service';
import { LiveFanout } from '../src/ws/live-fanout';
import { WsGateway } from '../src/ws/ws.gateway';

/**
 * Two notifications "replicas" in one process — each its own HTTP server,
 * WsGateway and LiveFanout — sharing a real NATS, which is the only way to
 * show that a push produced on one reaches a socket held by the other.
 *
 * The broker is docker-compose's (`make up`) or CI's service container, on
 * the same port as compose publishes it.
 */
const NATS_URL = process.env.NOTIFICATIONS_TEST_NATS_URL ?? 'nats://localhost:54222';

const config = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] }) as never;

interface Replica {
  server: Server;
  gateway: WsGateway;
  nats: NatsService;
  fanout: LiveFanout;
  url: string;
}

async function replica(natsUrl: string): Promise<Replica> {
  const gateway = new WsGateway();
  // The party is whatever the test says it is. Token verification is
  // WsAuth's job and is not what this suite is about.
  gateway.authenticate = async (req) => new URL(req.url ?? '/', 'http://x').searchParams.get('party');
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  gateway.attach(server);

  const nats = new NatsService(config({ NATS_URL: natsUrl }));
  nats.onModuleInit();
  const fanout = new LiveFanout(nats, gateway);
  fanout.onModuleInit();
  return { server, gateway, nats, fanout, url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws` };
}

async function stop(r: Replica): Promise<void> {
  await r.nats.close();
  r.gateway.onModuleDestroy();
  await new Promise((resolve) => r.server.close(resolve));
}

/** Connects as a party and collects every `notification` frame it receives. */
async function client(r: Replica, party: string): Promise<{ ws: WebSocket; got: unknown[] }> {
  const ws = new WebSocket(`${r.url}?party=${party}`);
  const got: unknown[] = [];
  await new Promise<void>((resolve, reject) => {
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as { type: string; payload: unknown };
      if (msg.type === 'connection.established') resolve();
      if (msg.type === 'notification') got.push(msg.payload);
    });
    ws.on('error', reject);
  });
  return { ws, got };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

describe('live push fan-out across replicas (real NATS)', () => {
  let a: Replica;
  let b: Replica;

  beforeAll(async () => {
    a = await replica(NATS_URL);
    b = await replica(NATS_URL);
    await Promise.all([a.fanout.whenConnected(), b.fanout.whenConnected()]);
  });

  afterAll(async () => {
    await stop(a);
    await stop(b);
  });

  it('reaches a socket held by another replica', async () => {
    const onB = await client(b, 'party_1');

    expect(a.fanout.push('party_1', 'notification', { subject: 'Payment complete' })).toBeNull();
    await settle();

    expect(onB.got).toEqual([{ subject: 'Payment complete' }]);
    onB.ws.close();
  });

  it('still reaches sockets on the publishing replica, once', async () => {
    // The publisher hears its own message back from its subscription, and
    // that is its only delivery path — a direct local send as well would
    // show the toast twice.
    const onA = await client(a, 'party_2');

    a.fanout.push('party_2', 'notification', { n: 1 });
    await settle();

    expect(onA.got).toEqual([{ n: 1 }]);
    onA.ws.close();
  });

  it('does not deliver one party\'s push to another party', async () => {
    const mine = await client(b, 'party_3');
    const theirs = await client(a, 'party_4');

    a.fanout.push('party_3', 'notification', { private: true });
    await settle();

    expect(mine.got).toHaveLength(1);
    expect(theirs.got).toHaveLength(0);
    mine.ws.close();
    theirs.ws.close();
  });

  it('sends an operator broadcast to every replica\'s sockets', async () => {
    const onA = await client(a, 'ops_1');
    const onB = await client(b, 'ops_2');

    b.fanout.push('', 'notification', { leg: 'LEG_C' });
    await settle();

    expect(onA.got).toEqual([{ leg: 'LEG_C' }]);
    expect(onB.got).toEqual([{ leg: 'LEG_C' }]);
    onA.ws.close();
    onB.ws.close();
  });
});

describe('live push without NATS (single-replica local dev)', () => {
  it('delivers in-process and reports the local socket count', async () => {
    const solo = await replica('');
    const c = await client(solo, 'party_1');

    expect(solo.fanout.isFannedOut()).toBe(false);
    expect(solo.fanout.push('party_1', 'notification', { local: true })).toBe(1);
    await settle();

    expect(c.got).toEqual([{ local: true }]);
    c.ws.close();
    await stop(solo);
  });

  it('cannot reach another replica, which is why multi-replica deployments set NATS_URL', async () => {
    const a = await replica('');
    const b = await replica('');
    const onB = await client(b, 'party_1');

    expect(a.fanout.push('party_1', 'notification', { lost: true })).toBe(0);
    await settle();

    expect(onB.got).toHaveLength(0);
    onB.ws.close();
    await stop(a);
    await stop(b);
  });

  it('degrades to in-process delivery when NATS is unreachable', async () => {
    // Nothing listens here. The socket is not the durable path, so a broker
    // outage must cost cross-replica reach and nothing else.
    const orphan = await replica('nats://127.0.0.1:1');
    const c = await client(orphan, 'party_1');

    expect(orphan.fanout.push('party_1', 'notification', { degraded: true })).toBe(1);
    await settle();

    expect(c.got).toEqual([{ degraded: true }]);
    c.ws.close();
    await stop(orphan);
  });
});
