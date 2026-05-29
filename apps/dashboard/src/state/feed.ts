/** Pure live-feed reducer over the backend's session-event envelope. */
import type { SessionRow, SessionStatus } from '../api/types';

export interface SessionEnvelope {
  eventId: number;
  type:
    | 'session.created'
    | 'session.advanced'
    | 'step.verification_started'
    | 'step.verified'
    | 'step.retry'
    | 'step.failed'
    | 'session.completed'
    | 'session.abandoned'
    | 'error';
  sessionId: string;
  orgId: string;
  ts: string;
  stepNumber?: number;
  message?: string;
}

export interface FeedEntry {
  sessionId: string;
  stepNumber?: number;
  kind: SessionEnvelope['type'];
  message?: string;
  ts: string;
}

export interface FeedState {
  sessions: SessionRow[];
  /** sessionId → last 20 events, newest last. */
  feed: Record<string, FeedEntry[]>;
  lastEventId: number;
}

export const initialFeed: FeedState = { sessions: [], feed: {}, lastEventId: 0 };

const STATUS_BY_EVENT: Partial<Record<SessionEnvelope['type'], SessionStatus>> = {
  'session.completed': 'completed',
  'session.abandoned': 'abandoned',
};

const FEED_CAP = 20;

export function reduceFeed(
  state: FeedState,
  action: { kind: 'hydrate'; sessions: SessionRow[] } | { kind: 'event'; event: SessionEnvelope },
): FeedState {
  if (action.kind === 'hydrate') {
    return { ...state, sessions: action.sessions };
  }
  const e = action.event;
  if (e.eventId <= state.lastEventId) return state;

  const entry: FeedEntry = {
    sessionId: e.sessionId,
    stepNumber: e.stepNumber,
    kind: e.type,
    message: e.message,
    ts: e.ts,
  };
  const prior = state.feed[e.sessionId] ?? [];
  const nextFeed = { ...state.feed, [e.sessionId]: [...prior, entry].slice(-FEED_CAP) };

  const statusUpdate = STATUS_BY_EVENT[e.type];
  const sessions = statusUpdate
    ? state.sessions.map((s) => (s.id === e.sessionId ? { ...s, status: statusUpdate } : s))
    : state.sessions;

  return { sessions, feed: nextFeed, lastEventId: e.eventId };
}
