import { useEffect, useRef, useState } from 'react';
import { getConfig } from '../config';
import { getAccessToken, refreshSession } from '../auth/session';

export type SocketState = 'connecting' | 'live' | 'reconnecting';

export interface LiveNotification {
  event: string;
  subject: string;
  body: string;
  severity: string;
  payload: Record<string, unknown> | null;
}

/**
 * services/notifications' WebSocket. The token rides in the query string
 * (browsers can't set headers on an upgrade); the server verifies it and
 * only accepts `ping` from the client — the socket is read-only by design.
 * Drops reconnect with capped backoff and a fresh token, so a user who
 * leaves a tab open across token rotations keeps receiving events.
 */
export function useLiveNotifications(onNotification: (n: LiveNotification) => void, enabled = true) {
  const [state, setState] = useState<SocketState>('connecting');
  const handler = useRef(onNotification);
  handler.current = onNotification;

  useEffect(() => {
    if (!enabled || typeof WebSocket === 'undefined') return;
    let socket: WebSocket | null = null;
    let attempt = 0;
    let stopped = false;
    let retryTimer: number | undefined;
    let pingTimer: number | undefined;

    const connect = async () => {
      const token = getAccessToken() ?? (await refreshSession());
      if (stopped) return;
      const url = new URL(getConfig().VITE_APP_WEBSOCKET_URL);
      if (token) url.searchParams.set('token', token);
      socket = new WebSocket(url);
      socket.onopen = () => {
        attempt = 0;
        setState('live');
        pingTimer = window.setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: 'ping' })), 25_000);
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string; payload?: LiveNotification };
          if (message.type === 'notification' && message.payload) handler.current(message.payload);
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = () => {
        window.clearInterval(pingTimer);
        if (stopped) return;
        setState('reconnecting');
        const delay = Math.min(30_000, 1_000 * 2 ** attempt) * (0.5 + Math.random() / 2);
        attempt += 1;
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    void connect();
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(pingTimer);
      socket?.close();
    };
  }, [enabled]);

  return state;
}
