/** Reconnecting WebSocket client. Subscribes on connect; replays via lastEventId. */
import type { SessionEventEnvelope } from './types.js';

export interface WsHandlers {
  onEvent: (e: SessionEventEnvelope) => void;
  onConnection: (status: 'connecting' | 'open' | 'paused') => void;
  /** Caller supplies the current lastEventId at (re)subscribe time. */
  getLastEventId: () => number;
  sessionId: string;
}

export interface WsClient {
  close: () => void;
}

const BACKOFFS = [500, 1000, 2000, 4000, 8000, 8000];

export function connect(url: string, handlers: WsHandlers): WsClient {
  let socket: WebSocket | undefined;
  let attempt = 0;
  let closed = false;

  const open = () => {
    handlers.onConnection('connecting');
    socket = new WebSocket(url);

    socket.addEventListener('open', () => {
      attempt = 0;
      handlers.onConnection('open');
      socket?.send(
        JSON.stringify({
          type: 'subscribe',
          channel: `session:${handlers.sessionId}`,
          lastEventId: handlers.getLastEventId(),
        }),
      );
    });

    socket.addEventListener('message', (msg) => {
      try {
        const parsed = JSON.parse(typeof msg.data === 'string' ? msg.data : '') as
          | SessionEventEnvelope
          | { type: 'subscribed' | 'error' };
        if (typeof (parsed as SessionEventEnvelope).eventId === 'number') {
          handlers.onEvent(parsed as SessionEventEnvelope);
        }
      } catch {
        // Ignore non-JSON frames.
      }
    });

    const dropped = () => {
      if (closed) return;
      handlers.onConnection('paused');
      const delay = BACKOFFS[Math.min(attempt, BACKOFFS.length - 1)]!;
      attempt++;
      setTimeout(open, delay);
    };

    socket.addEventListener('close', dropped);
    socket.addEventListener('error', () => socket?.close());
  };

  // iOS Safari suspends the page (and silently kills the socket) while the
  // camera sheet is open — and no 'close' event ever fires, so the backoff
  // loop never runs and the HUD misses its verdicts. Force a reconnect the
  // moment the page becomes visible again; the resubscribe replays anything
  // missed via lastEventId.
  const onVisible = () => {
    if (closed || document.visibilityState !== 'visible') return;
    if (socket && socket.readyState === WebSocket.OPEN) {
      attempt = 0;
      socket.close(); // triggers 'close' → dropped() → fast reopen + replay
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
  }

  open();
  return {
    close() {
      closed = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
      socket?.close();
    },
  };
}
