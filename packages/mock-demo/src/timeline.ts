/**
 * Scripted ~90s LOTO timeline emitted as backend-shaped envelopes.
 *
 * Each step takes ~8s — split as 1.5s pending, ~3s processing, ~3s verified
 * (the dashboard shows the verdict, the HUD waits for the "pinch"), then the
 * next step is advanced. Step 5 fails once: at +3s a retry event flips the
 * HUD amber, then ~5s later we retry from "verification_started" and verify
 * green. Total runtime: ~90s.
 *
 * Pure functions over a wall-clock — `start()` returns a controller with
 * pause/resume/stop so a screenshot session can hold a single frame.
 */
import { STEPS, STEP_5_RETRY_MESSAGE } from './steps.js';
import type { TimelineCallback, TimelineEvent } from './types.js';

const SESSION_ID = 'demo-session-2026-loto-001';
const ORG_ID = 'org_eon_demo';
const STEP_ID_PREFIX = 'step-';

export const DEMO_DURATION_MS = 90_000;

interface ScheduledEvent {
  offsetMs: number;
  event: Omit<TimelineEvent, 'eventId' | 'ts'>;
}

function buildSchedule(): ScheduledEvent[] {
  const schedule: ScheduledEvent[] = [];
  let t = 0;

  schedule.push({
    offsetMs: t,
    event: {
      type: 'session.created',
      sessionId: SESSION_ID,
      orgId: ORG_ID,
      stepNumber: 1,
      stepId: `${STEP_ID_PREFIX}1`,
    },
  });

  for (const step of STEPS) {
    const n = step.stepNumber;
    const stepId = `${STEP_ID_PREFIX}${n}`;

    // 1.5s pause on "pending" so the HUD shows the step card.
    t += 1500;
    schedule.push({
      offsetMs: t,
      event: {
        type: 'step.verification_started',
        sessionId: SESSION_ID,
        orgId: ORG_ID,
        stepNumber: n,
        stepId,
      },
    });

    if (n === 5) {
      // Retry: amber message after ~3s, then a new verification 5s later that
      // resolves green.
      t += 3000;
      schedule.push({
        offsetMs: t,
        event: {
          type: 'step.retry',
          sessionId: SESSION_ID,
          orgId: ORG_ID,
          stepNumber: n,
          stepId,
          verified: false,
          confidence: 'low',
          message: STEP_5_RETRY_MESSAGE,
          detail: 'Disconnect-handle position ambiguous; retake with the OFF label visible.',
        },
      });
      t += 5000;
      schedule.push({
        offsetMs: t,
        event: {
          type: 'step.verification_started',
          sessionId: SESSION_ID,
          orgId: ORG_ID,
          stepNumber: n,
          stepId,
        },
      });
    }

    // Verified.
    t += 2500;
    schedule.push({
      offsetMs: t,
      event: {
        type: 'step.verified',
        sessionId: SESSION_ID,
        orgId: ORG_ID,
        stepNumber: n,
        stepId,
        verified: true,
        confidence: 'high',
        message: step.verdictMessage,
        detail: step.verdictDetail,
      },
    });

    // Advance to the next step (or stay on 10 for the final pause).
    if (n < STEPS.length) {
      t += 2500;
      schedule.push({
        offsetMs: t,
        event: {
          type: 'session.advanced',
          sessionId: SESSION_ID,
          orgId: ORG_ID,
          stepNumber: n + 1,
          stepId: `${STEP_ID_PREFIX}${n + 1}`,
        },
      });
    }
  }

  // Hold on the final verdict for a few seconds, then complete.
  t += 3000;
  schedule.push({
    offsetMs: t,
    event: {
      type: 'session.completed',
      sessionId: SESSION_ID,
      orgId: ORG_ID,
    },
  });

  return schedule;
}

export interface TimelineController {
  pause: () => void;
  resume: () => void;
  stop: () => void;
  isPaused: () => boolean;
  reset: () => void;
}

interface StartOptions {
  onEvent: TimelineCallback;
  /** Optional: speed up or slow down for screenshots; 1 = real-time. */
  speed?: number;
}

export function start({ onEvent, speed = 1 }: StartOptions): TimelineController {
  const schedule = buildSchedule();
  let eventId = 0;
  let cursor = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let paused = false;
  let pausedAt: number | undefined;
  let baseStart = Date.now();

  function tickNow(): number {
    return (Date.now() - baseStart) * speed;
  }

  function scheduleNext(): void {
    if (stopped || paused || cursor >= schedule.length) return;
    const next = schedule[cursor]!;
    const delay = Math.max(0, next.offsetMs - tickNow());
    timer = setTimeout(() => {
      if (stopped || paused) return;
      eventId++;
      const evt: TimelineEvent = {
        ...next.event,
        eventId,
        ts: new Date().toISOString(),
      };
      onEvent(evt);
      cursor++;
      scheduleNext();
    }, delay / speed);
  }

  scheduleNext();

  return {
    pause() {
      if (paused || stopped) return;
      paused = true;
      pausedAt = tickNow();
      if (timer) clearTimeout(timer);
    },
    resume() {
      if (!paused || stopped) return;
      const adjust = tickNow() - (pausedAt ?? 0);
      baseStart += adjust / speed;
      paused = false;
      scheduleNext();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    isPaused: () => paused,
    reset() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
