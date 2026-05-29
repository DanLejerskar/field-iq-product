import { describe, expect, it } from 'vitest';
import { initialFeed, reduceFeed, type SessionEnvelope } from './feed';
import type { SessionRow } from '../api/types';

const session: SessionRow = {
  id: 's1',
  orgId: 'o1',
  equipmentId: 'eq1',
  procedureId: 'proc1',
  procedureVersion: '1.0.0',
  technicianUserId: 'u1',
  status: 'active',
  startedAt: '2026-05-28T10:00:00.000Z',
  completedAt: null,
};

const evt = (over: Partial<SessionEnvelope>): SessionEnvelope => ({
  eventId: 1,
  type: 'step.verified',
  sessionId: 's1',
  orgId: 'o1',
  ts: '2026-05-28T10:00:01.000Z',
  ...over,
});

describe('reduceFeed', () => {
  it('hydrates the session list', () => {
    const s = reduceFeed(initialFeed, { kind: 'hydrate', sessions: [session] });
    expect(s.sessions).toHaveLength(1);
  });

  it('appends events to the per-session feed and tracks lastEventId', () => {
    let s = reduceFeed(initialFeed, { kind: 'hydrate', sessions: [session] });
    s = reduceFeed(s, { kind: 'event', event: evt({ eventId: 1, stepNumber: 1 }) });
    s = reduceFeed(s, {
      kind: 'event',
      event: evt({ eventId: 2, type: 'step.retry', stepNumber: 2, message: 'unclear' }),
    });
    expect(s.feed.s1).toHaveLength(2);
    expect(s.feed.s1![1]!.message).toBe('unclear');
    expect(s.lastEventId).toBe(2);
  });

  it('dedupes replayed events by eventId', () => {
    let s = reduceFeed(initialFeed, { kind: 'event', event: evt({ eventId: 5, stepNumber: 1 }) });
    s = reduceFeed(s, { kind: 'event', event: evt({ eventId: 5, stepNumber: 1, message: 'dup' }) });
    expect(s.feed.s1).toHaveLength(1);
    expect(s.feed.s1![0]!.message).toBeUndefined();
  });

  it('flips session status when session.completed / abandoned arrives', () => {
    let s = reduceFeed(initialFeed, { kind: 'hydrate', sessions: [session] });
    s = reduceFeed(s, { kind: 'event', event: evt({ eventId: 1, type: 'session.completed' }) });
    expect(s.sessions[0]!.status).toBe('completed');
  });

  it('caps the per-session feed at 20 entries', () => {
    let s = initialFeed;
    for (let i = 1; i <= 30; i++) {
      s = reduceFeed(s, { kind: 'event', event: evt({ eventId: i, stepNumber: i }) });
    }
    expect(s.feed.s1).toHaveLength(20);
    expect(s.feed.s1![0]!.stepNumber).toBe(11);
    expect(s.feed.s1![19]!.stepNumber).toBe(30);
  });
});
