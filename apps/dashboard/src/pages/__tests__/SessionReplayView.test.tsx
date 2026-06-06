import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReplayEvent, ReplayResponse } from '../../api/replay';
import { SessionReplayView } from '../SessionReplayPage';

function evt(id: string, type: ReplayEvent['type'], iso: string): ReplayEvent {
  switch (type) {
    case 'session.started':
    case 'step.started':
    case 'session.ended':
      return { id, type, stepNumber: null, timestamp: iso, payload: {} as Record<string, never> };
    case 'step.photo_captured':
      return {
        id,
        type,
        stepNumber: 1,
        timestamp: iso,
        payload: { photoUrl: 'data:,', capturedAt: iso },
      };
    case 'step.verified':
      return {
        id,
        type,
        stepNumber: 1,
        timestamp: iso,
        payload: { verdict: 'pass', confidence: 0.85, verdictText: 'ok' },
      };
    case 'step.retry':
      return {
        id,
        type,
        stepNumber: 1,
        timestamp: iso,
        payload: { reason: 'try again', previousVerdictText: 'no' },
      };
    case 'worker_dialogue':
      return {
        id,
        type,
        stepNumber: 1,
        timestamp: iso,
        payload: {
          transcript: 'the valve is stuck',
          intent: 'describe_problem',
          severity: 'medium',
          aiResponse: 'release pressure first',
        },
      };
    case 'safety_alert':
      return {
        id,
        type,
        stepNumber: 1,
        timestamp: iso,
        payload: {
          severity: 'critical',
          summary: 'gas detected',
          recommendedAction: 'evacuate',
          detectedBy: 'keyword',
        },
      };
  }
}

function synthetic(): ReplayResponse {
  return {
    session: {
      id: 'sess-1',
      workerId: 'u-1',
      workerName: 'Maya Wu',
      procedureId: 'proc-1',
      procedureTitle: 'DAC #811 LOTO',
      startedAt: '2026-06-06T10:00:00Z',
      endedAt: '2026-06-06T10:05:00Z',
      status: 'completed',
      finalOutcome: 'pass',
    },
    events: [
      evt('e0', 'session.started', '2026-06-06T10:00:00Z'),
      evt('e1', 'step.photo_captured', '2026-06-06T10:00:30Z'),
      evt('e2', 'step.verified', '2026-06-06T10:00:40Z'),
      evt('e3', 'step.retry', '2026-06-06T10:01:10Z'),
      evt('e4', 'worker_dialogue', '2026-06-06T10:01:40Z'),
      evt('e5', 'safety_alert', '2026-06-06T10:02:30Z'),
      evt('e6', 'session.ended', '2026-06-06T10:05:00Z'),
    ],
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('SessionReplayView', () => {
  it('renders every event type as a timeline dot', () => {
    act(() => {
      root.render(<SessionReplayView data={synthetic()} />);
    });
    const dots = container.querySelectorAll('[data-event-type]');
    expect(dots).toHaveLength(7);
    const types = Array.from(dots).map((d) => d.getAttribute('data-event-type'));
    expect(types).toContain('session.started');
    expect(types).toContain('step.photo_captured');
    expect(types).toContain('step.verified');
    expect(types).toContain('step.retry');
    expect(types).toContain('worker_dialogue');
    expect(types).toContain('safety_alert');
    expect(types).toContain('session.ended');
  });

  it('clicking a dot updates the details panel to that event type', () => {
    act(() => {
      root.render(<SessionReplayView data={synthetic()} />);
    });
    const safetyDot = container.querySelector('[data-testid="replay-dot-e5"]') as HTMLButtonElement;
    act(() => {
      safetyDot.click();
    });
    expect(container.querySelector('[data-testid="replay-details-safety_alert"]')).toBeTruthy();
    expect(container.textContent).toContain('gas detected');
    expect(container.textContent).toContain('evacuate');
  });

  it('toggling the safety_alert filter hides the alert dot', () => {
    act(() => {
      root.render(<SessionReplayView data={synthetic()} />);
    });
    expect(container.querySelector('[data-testid="replay-dot-e5"]')).toBeTruthy();
    const checkbox = container.querySelector(
      '[data-testid="replay-filter-safety_alert"] input',
    ) as HTMLInputElement;
    act(() => {
      checkbox.click();
    });
    expect(container.querySelector('[data-testid="replay-dot-e5"]')).toBeFalsy();
    // Lifecycle events are unfiltered and remain.
    expect(container.querySelector('[data-testid="replay-dot-e0"]')).toBeTruthy();
  });

  it('clicking a list row updates the details panel', () => {
    act(() => {
      root.render(<SessionReplayView data={synthetic()} />);
    });
    const dialogueRow = container.querySelector(
      '[data-testid="replay-event-row-e4"]',
    ) as HTMLButtonElement;
    act(() => {
      dialogueRow.click();
    });
    expect(container.querySelector('[data-testid="replay-details-worker_dialogue"]')).toBeTruthy();
    expect(container.textContent).toContain('the valve is stuck');
  });

  it('play button toggles the pressed state', () => {
    act(() => {
      root.render(<SessionReplayView data={synthetic()} />);
    });
    const btn = container.querySelector('[data-testid="replay-play-pause"]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    act(() => {
      btn.click();
    });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('selecting a speed marks that pill aria-pressed', () => {
    act(() => {
      root.render(<SessionReplayView data={synthetic()} />);
    });
    const twox = container.querySelector('[data-testid="replay-speed-2"]') as HTMLButtonElement;
    expect(twox.getAttribute('aria-pressed')).toBe('false');
    act(() => {
      twox.click();
    });
    expect(twox.getAttribute('aria-pressed')).toBe('true');
  });

  it('filtering away the selected event re-selects the next visible one', () => {
    act(() => {
      root.render(<SessionReplayView data={synthetic()} />);
    });
    // Select the safety_alert.
    const safetyDot = container.querySelector('[data-testid="replay-dot-e5"]') as HTMLButtonElement;
    act(() => {
      safetyDot.click();
    });
    expect(container.querySelector('[data-testid="replay-details-safety_alert"]')).toBeTruthy();
    // Now filter safety_alert away.
    const checkbox = container.querySelector(
      '[data-testid="replay-filter-safety_alert"] input',
    ) as HTMLInputElement;
    act(() => {
      checkbox.click();
    });
    // Details panel should now show some other event's detail (not safety_alert).
    expect(container.querySelector('[data-testid="replay-details-safety_alert"]')).toBeFalsy();
  });
});
