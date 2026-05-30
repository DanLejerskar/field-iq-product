/** Reconnecting WebSocket client. Subscribes to one channel per connection. */
import type { SessionEnvelope } from '../state/feed';

export interface WsHandlers {
  channel: string;
  onEvent: (e: SessionEnvelope) => void;
  onConnection: (status: 'connecting' | 'open' | 'paused') => void;
  getLastEventId: () => number;
}

export interface WsClient {
  close: () => void;
}

const BACKOFFS = [500, 1000, 2000, 4000, 8000, 8000];

export function connect(wsHost: string, token: string, handlers: WsHandlers): WsClient {
  let socket: WebSocket | undefined;
  let attempt = 0;
  let closed = false;

  const open = () => {
    handlers.onConnection('connecting');
    socket = new WebSocket(`${wsHost}/ws?token=${encodeURIComponent(token)}`);

    socket.onopen = () => {
      attempt = 0;
      handlers.onConnection('open');
      socket?.send(
        JSON.stringify({
          type: 'subscribe',
          channel: handlers.channel,
          lastEventId: handlers.getLastEventId(),
        }),
      );
    };

    socket.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(typeof msg.data === 'string' ? msg.data : '');
        if (typeof parsed?.eventId === 'number') handlers.onEvent(parsed as SessionEnvelope);
      } catch {
        /* ignore */
      }
    };

    const dropped = () => {
      if (closed) return;
      handlers.onConnection('paused');
      const delay = BACKOFFS[Math.min(attempt, BACKOFFS.length - 1)]!;
      attempt++;
      setTimeout(open, delay);
    };
    socket.onclose = dropped;
    socket.onerror = () => socket?.close();
  };

  open();
  return {
    close() {
      closed = true;
      socket?.close();
    },
  };
}
