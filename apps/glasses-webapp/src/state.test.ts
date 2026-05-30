import { describe, expect, it } from 'vitest';
import { reduce } from './state.js';
import { initialState, type SessionEventEnvelope } from './types.js';

const evt = (over: Partial<SessionEventEnvelope>): SessionEventEnvelope => ({
  eventId: 1,
  type: 'step.verification_started',
  sessionId: 's1',
  orgId: 'o1',
  ts: '2026-05-28T00:00:00.000Z',
  ...over,
});

describe('reducer', () => {
  it('session.created seats the first step in pending', () => {
    const s = reduce(initialState, {
      kind: 'event',
      event: evt({ eventId: 1, type: 'session.created', stepNumber: 1 }),
    });
    expect(s.sessionId).toBe('s1');
    expect(s.currentStep).toBe(1);
    expect(s.cardState).toBe('pending');
  });

  it('moves through processing → verified → advanced', () => {
    let s = reduce(initialState, { kind: 'hydrate', sessionId: 's1', steps: [], currentStep: 1 });
    s = reduce(s, {
      kind: 'event',
      event: evt({ eventId: 1, type: 'step.verification_started', stepNumber: 1 }),
    });
    expect(s.cardState).toBe('processing');
    s = reduce(s, {
      kind: 'event',
      event: evt({ eventId: 2, type: 'step.verified', stepNumber: 1, message: 'OK' }),
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

  it('renders retry with the Claude message', () => {
    const s = reduce(initialState, {
      kind: 'event',
      event: evt({ eventId: 1, type: 'step.retry', message: 'Switch state unclear' }),
    });
    expect(s.cardState).toBe('retry');
    expect(s.message).toBe('Switch state unclear');
  });

  it('dedupes events at or below lastEventId (reconnect replay)', () => {
    let s = reduce(initialState, {
      kind: 'event',
      event: evt({ eventId: 5, type: 'step.verified', stepNumber: 1 }),
    });
    expect(s.lastEventId).toBe(5);
    s = reduce(s, {
      kind: 'event',
      event: evt({ eventId: 5, type: 'step.retry', message: 'stale' }),
    });
    expect(s.cardState).toBe('verified');
    expect(s.message).toBeUndefined();
  });

  it('paused connection shows the paused card; reconnecting clears it', () => {
    let s = reduce(initialState, { kind: 'connection', status: 'paused' });
    expect(s.cardState).toBe('paused');
    s = reduce(s, { kind: 'connection', status: 'open' });
    expect(s.cardState).toBe('pending');
  });

  it('session.completed flips to the complete card', () => {
    const s = reduce(initialState, {
      kind: 'event',
      event: evt({ eventId: 1, type: 'session.completed' }),
    });
    expect(s.cardState).toBe('complete');
  });
});
