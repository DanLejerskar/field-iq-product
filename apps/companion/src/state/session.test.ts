import { describe, expect, it } from 'vitest';
import { initialMirror, reduce } from './session';
import type { SessionEventEnvelope } from '../api/types';

const evt = (over: Partial<SessionEventEnvelope>): SessionEventEnvelope => ({
  eventId: 1,
  type: 'step.verification_started',
  sessionId: 's1',
  orgId: 'o1',
  ts: '2026-05-28T00:00:00.000Z',
  ...over,
});

describe('phone mirror reducer', () => {
  it('hydrates from a fresh session', () => {
    const s = reduce(initialMirror, {
      kind: 'hydrate',
      sessionId: 's1',
      currentStep: 1,
      totalSteps: 10,
    });
    expect(s.sessionId).toBe('s1');
    expect(s.totalSteps).toBe(10);
    expect(s.cardState).toBe('pending');
  });

  it('transitions through processing → verified → advanced', () => {
    let s = reduce(initialMirror, {
      kind: 'hydrate',
      sessionId: 's1',
      currentStep: 1,
      totalSteps: 10,
    });
    s = reduce(s, {
      kind: 'event',
      event: evt({ eventId: 1, type: 'step.verification_started', stepNumber: 1 }),
    });
    expect(s.cardState).toBe('processing');
    s = reduce(s, {
      kind: 'event',
      event: evt({ eventId: 2, type: 'step.verified', stepNumber: 1 }),
    });
    expect(s.cardState).toBe('verified');
    expect(s.verified.has(1)).toBe(true);
    s = reduce(s, {
      kind: 'event',
      event: evt({ eventId: 3, type: 'session.advanced', stepNumber: 2 }),
    });
    expect(s.currentStep).toBe(2);
    expect(s.cardState).toBe('pending');
  });

  it('dedupes a replayed event by eventId', () => {
    let s = reduce(initialMirror, {
      kind: 'event',
      event: evt({ eventId: 5, type: 'step.verified', stepNumber: 1 }),
    });
    expect(s.lastEventId).toBe(5);
    s = reduce(s, {
      kind: 'event',
      event: evt({ eventId: 5, type: 'step.retry', message: 'stale' }),
    });
    expect(s.message).toBeUndefined();
    expect(s.cardState).toBe('verified');
  });

  it('shows paused while disconnected, then heals on reconnect', () => {
    let s = reduce(initialMirror, { kind: 'connection', status: 'paused' });
    expect(s.cardState).toBe('paused');
    s = reduce(s, { kind: 'connection', status: 'open' });
    expect(s.cardState).toBe('pending');
  });
});
