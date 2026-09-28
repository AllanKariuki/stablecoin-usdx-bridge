import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { IncomingMessage } from 'node:http';
import { Server as HttpServer } from 'node:http';
import { RawData, WebSocket, WebSocketServer } from 'ws';

interface Client {
  socket: WebSocket;
  partyId: string;
  /** Answered by a pong; a socket that stops answering is reaped. */
  alive: boolean;
}

/**
 * The WebSocket fan-out at `/ws` on :3000.
 *
 * Both the path and the port are fixed by something that already exists:
 * `frontend/public/runtime-config.js` declares
 * `VITE_APP_WEBSOCKET_URL = ws://localhost:3000/ws`, and
 * `frontend/src/services/websocketService.ts` connects to it. This service is
 * built to that contract rather than the other way round — which is also why
 * Grafana was put on 53000 back in P3.
 *
 * The message envelope matches `frontend/src/types/auth-and-websocket/
 * websocket.ts`'s `WebSocketMessage` exactly: `{id, type, payload, timestamp}`.
 */
@Injectable()
export class WsGateway implements OnModuleDestroy {
  private readonly logger = new Logger(WsGateway.name);
  private server: WebSocketServer | null = null;
  private readonly clients = new Set<Client>();
  private heartbeat: NodeJS.Timeout | null = null;

  /**
   * Resolves a connection's identity.
   *
   * Set by the module to an authenticator, so this class does no token
   * verification of its own. A WebSocket upgrade does not pass through
   * Traefik's ForwardAuth the way an HTTP request does — the browser cannot
   * set headers on `new WebSocket()` — so the token arrives as a query
   * parameter and is verified here.
   */
  authenticate: ((req: IncomingMessage) => Promise<string | null>) | null = null;

  attach(httpServer: HttpServer): void {
    // noServer + a manual upgrade handler, rather than passing `server`
    // directly: authentication has to happen *before* the handshake
    // completes, so that an unauthenticated client gets a clean 401 instead of
    // an open socket that is then closed, which browsers report as a network
    // error with no explanation.
    this.server = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req, socket, head) => {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost');
      if (pathname !== '/ws') {
        socket.destroy();
        return;
      }

      void (async () => {
        let partyId: string | null = null;
        try {
          partyId = this.authenticate ? await this.authenticate(req) : null;
        } catch (err) {
          this.logger.warn(`websocket auth threw: ${err instanceof Error ? err.message : String(err)}`);
        }

        if (!partyId) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        this.server!.handleUpgrade(req, socket, head, (ws) => this.register(ws, partyId!));
      })();
    });

    this.heartbeat = setInterval(() => this.reap(), 30_000);
    this.heartbeat.unref();
    this.logger.log('websocket gateway listening on /ws');
  }

  private register(socket: WebSocket, partyId: string): void {
    const client: Client = { socket, partyId, alive: true };
    this.clients.add(client);
    this.logger.log(`websocket connected: ${partyId} (${this.clients.size} total)`);

    socket.on('pong', () => {
      client.alive = true;
    });
    socket.on('close', () => {
      this.clients.delete(client);
    });
    socket.on('error', () => {
      this.clients.delete(client);
    });
    socket.on('message', (data) => this.onMessage(client, data));

    this.send(socket, { type: 'connection.established', payload: { partyId } });
  }

  /**
   * Inbound messages.
   *
   * Deliberately almost nothing: this socket is a fan-out, not an API. A
   * client that could *act* over the WebSocket would be acting over a channel
   * that bypasses the gateway's route table entirely — every permission check
   * this platform has lives in auth-proxy, which sees HTTP requests. So the
   * only thing accepted is a ping.
   */
  private onMessage(client: Client, data: RawData): void {
    let message: { type?: string };
    try {
      message = JSON.parse(data.toString()) as { type?: string };
    } catch {
      return;
    }
    if (message.type === 'ping') {
      this.send(client.socket, { type: 'pong', payload: {} });
    }
  }

  /**
   * Sends to every socket a party has open — they may have several (two tabs,
   * a phone), and all of them should update.
   *
   * Returns how many sockets received it, which the delivery log records: a
   * count of zero is what "sent in-app while they were offline" looks like,
   * and is the reason the notification is also stored for them to find later.
   */
  broadcast(partyId: string, type: string, payload: unknown): number {
    let delivered = 0;
    for (const client of this.clients) {
      if (client.partyId !== partyId) continue;
      if (this.send(client.socket, { type, payload })) delivered += 1;
    }
    return delivered;
  }

  /** Operator broadcast: a reconciliation break goes to everyone watching. */
  broadcastAll(type: string, payload: unknown): number {
    let delivered = 0;
    for (const client of this.clients) {
      if (this.send(client.socket, { type, payload })) delivered += 1;
    }
    return delivered;
  }

  connectionCount(): number {
    return this.clients.size;
  }

  private send(socket: WebSocket, message: { type: string; payload: unknown }): boolean {
    if (socket.readyState !== WebSocket.OPEN) return false;
    try {
      // The envelope frontend/src/types/auth-and-websocket/websocket.ts
      // declares. Matching it exactly is what lets the existing
      // websocketMiddleware consume this with no changes.
      socket.send(
        JSON.stringify({
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: message.type,
          payload: message.payload,
          timestamp: Date.now(),
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Closes sockets that stopped answering pings.
   *
   * A TCP connection to a laptop that went into a tunnel stays "open" for a
   * long time without a heartbeat, and every one of those is a party this
   * service believes is online — which makes the delivered count a lie and
   * leaks memory in equal measure.
   */
  private reap(): void {
    for (const client of this.clients) {
      if (!client.alive) {
        client.socket.terminate();
        this.clients.delete(client);
        continue;
      }
      client.alive = false;
      try {
        client.socket.ping();
      } catch {
        this.clients.delete(client);
      }
    }
  }

  onModuleDestroy(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const client of this.clients) {
      client.socket.close(1001, 'server shutting down');
    }
    this.clients.clear();
    this.server?.close();
  }
}
