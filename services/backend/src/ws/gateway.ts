/**
 * WebSocket gateway (M4). Clients connect to /ws?token=<jwt>, then subscribe to channels:
 *   { type: "subscribe", channel: "session:<id>", lastEventId?: number }
 *   { type: "subscribe", channel: "org:<orgId>:sessions" }   // dashboard
 *
 * The server forwards every session.* event published on those channels (02_Architecture §6 /
 * Phase 1 prompt M4). Reconnection-safe: a session subscribe with lastEventId replays missed
 * events from the per-session history; clients dedupe by eventId.
 *
 * Org scoping: an org channel must match the caller's JWT org.
 */
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { config } from '../config/env.js';
import { verifyJwt, type JwtClaims } from '../auth/tokens.js';
import { isAllowedOrigin } from '../server.js';
import { createSubscriber, replaySessionEvents } from '../services/bus.js';

interface SubscribeMessage {
  type: 'subscribe' | 'unsubscribe';
  channel: string;
  lastEventId?: number;
}

function send(socket: WebSocket, obj: unknown): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(obj));
}

function authorize(channel: string, principal: JwtClaims): boolean {
  if (channel.startsWith('org:')) return channel === `org:${principal.org}:sessions`;
  if (channel.startsWith('session:')) return true; // v1: any authenticated org member
  return false;
}

export async function registerWebSocketGateway(app: FastifyInstance): Promise<void> {
  const { default: websocket } = await import('@fastify/websocket');
  await app.register(websocket);

  app.get('/ws', { websocket: true }, (socket: WebSocket, req) => {
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin)) {
      send(socket, { type: 'error', code: 'forbidden_origin', message: `Origin not allowed: ${origin ?? '(none)'}` });
      socket.close();
      return;
    }
    const token = (req.query as { token?: string }).token;
    let principal: JwtClaims;
    try {
      if (!token) throw new Error('missing token');
      principal = verifyJwt(token, config.jwtSigningSecret);
    } catch {
      send(socket, { type: 'error', code: 'unauthorized', message: 'Invalid or missing token' });
      socket.close();
      return;
    }

    const sub = createSubscriber();
    const channels = new Set<string>();

    sub.on('message', (channel, message) => {
      if (channels.has(channel)) socket.send(message);
    });

    socket.on('message', (raw: Buffer) => {
      let msg: SubscribeMessage;
      try {
        msg = JSON.parse(raw.toString()) as SubscribeMessage;
      } catch {
        send(socket, { type: 'error', code: 'bad_message', message: 'Malformed JSON' });
        return;
      }
      if (!authorize(msg.channel, principal)) {
        send(socket, { type: 'error', code: 'forbidden', message: `Cannot access ${msg.channel}` });
        return;
      }
      if (msg.type === 'subscribe') {
        channels.add(msg.channel);
        void sub.subscribe(msg.channel);
        send(socket, { type: 'subscribed', channel: msg.channel });
        if (msg.channel.startsWith('session:') && msg.lastEventId !== undefined) {
          const sessionId = msg.channel.slice('session:'.length);
          void replaySessionEvents(sessionId, msg.lastEventId).then((events) => {
            for (const e of events) send(socket, e);
          });
        }
      } else if (msg.type === 'unsubscribe') {
        channels.delete(msg.channel);
        void sub.unsubscribe(msg.channel);
      }
    });

    socket.on('close', () => {
      void sub.quit();
    });
  });
}
