/** Test WS client that resolves when a given event type arrives. */
import WebSocket from 'ws';

export interface Envelope {
  eventId: number;
  type: string;
  sessionId: string;
  stepNumber?: number;
  message?: string;
}

export class TestSocket {
  private socket: WebSocket;
  private readonly received: Envelope[] = [];
  private readonly listeners: Array<(e: Envelope) => void> = [];
  private readyPromise: Promise<void>;

  constructor(wsHost: string, token: string) {
    this.socket = new WebSocket(`${wsHost}/ws?token=${encodeURIComponent(token)}`);
    this.readyPromise = new Promise<void>((res, rej) => {
      this.socket.once('open', () => res());
      this.socket.once('error', (err) => rej(err));
    });
    this.socket.on('message', (raw: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(raw.toString()) as Envelope;
        if (typeof parsed.eventId === 'number') {
          this.received.push(parsed);
          for (const l of this.listeners) l(parsed);
        }
      } catch {
        /* ignore */
      }
    });
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  subscribe(channel: string, lastEventId = 0): void {
    this.socket.send(JSON.stringify({ type: 'subscribe', channel, lastEventId }));
  }

  /** Resolve when the next envelope matching `predicate` arrives, or reject on timeout. */
  await(predicate: (e: Envelope) => boolean, timeoutMs = 5000): Promise<Envelope> {
    // Check the backlog first.
    const hit = this.received.find(predicate);
    if (hit) return Promise.resolve(hit);
    return new Promise<Envelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.listeners.indexOf(listener);
        if (idx >= 0) this.listeners.splice(idx, 1);
        reject(new Error(`WS event timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      const listener = (e: Envelope) => {
        if (!predicate(e)) return;
        clearTimeout(timer);
        const idx = this.listeners.indexOf(listener);
        if (idx >= 0) this.listeners.splice(idx, 1);
        resolve(e);
      };
      this.listeners.push(listener);
    });
  }

  close(): void {
    this.socket.close();
  }
}
