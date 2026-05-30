import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_DURATION_MS, start } from './timeline.js';
import type { TimelineEvent } from './types.js';

describe('mock timeline', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function collect(speed = 1): { events: TimelineEvent[]; controller: ReturnType<typeof start> } {
    const events: TimelineEvent[] = [];
    const controller = start({ onEvent: (e) => events.push(e), speed });
    return { events, controller };
  }

  it('emits session.created first and session.completed last', () => {
    const { events } = collect();
    vi.advanceTimersByTime(DEMO_DURATION_MS + 5000);
    expect(events[0]!.type).toBe('session.created');
    expect(events[events.length - 1]!.type).toBe('session.completed');
  });

  it('verifies every one of the 10 steps once', () => {
    const { events } = collect();
    vi.advanceTimersByTime(DEMO_DURATION_MS + 5000);
    const verified = events.filter((e) => e.type === 'step.verified').map((e) => e.stepNumber);
    expect(verified.sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('emits exactly one step.retry on step 5', () => {
    const { events } = collect();
    vi.advanceTimersByTime(DEMO_DURATION_MS + 5000);
    const retries = events.filter((e) => e.type === 'step.retry');
    expect(retries).toHaveLength(1);
    expect(retries[0]!.stepNumber).toBe(5);
    expect(retries[0]!.message).toMatch(/Handle position unclear/);
  });

  it('emits two verification_started events for step 5 (original + retry)', () => {
    const { events } = collect();
    vi.advanceTimersByTime(DEMO_DURATION_MS + 5000);
    const startsForStep5 = events.filter(
      (e) => e.type === 'step.verification_started' && e.stepNumber === 5,
    );
    expect(startsForStep5).toHaveLength(2);
  });

  it('eventId is strictly monotonic', () => {
    const { events } = collect();
    vi.advanceTimersByTime(DEMO_DURATION_MS + 5000);
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.eventId).toBeGreaterThan(events[i - 1]!.eventId);
    }
  });

  it('pause stops further events; resume continues', () => {
    const { events, controller } = collect();
    vi.advanceTimersByTime(8000);
    const beforePause = events.length;
    controller.pause();
    vi.advanceTimersByTime(30_000);
    expect(events.length).toBe(beforePause);
    controller.resume();
    vi.advanceTimersByTime(DEMO_DURATION_MS);
    expect(events.length).toBeGreaterThan(beforePause);
    expect(events[events.length - 1]!.type).toBe('session.completed');
  });

  it('finishes within DEMO_DURATION_MS + 5s of real time', () => {
    const { events } = collect();
    vi.advanceTimersByTime(DEMO_DURATION_MS + 5000);
    expect(events[events.length - 1]!.type).toBe('session.completed');
  });
});
