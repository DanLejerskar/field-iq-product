import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplayEvent } from '../../../api/replay';
import { ReplayTimeline } from '../ReplayTimeline';

function evt(id: string, type: ReplayEvent['type'], iso: string): ReplayEvent {
  // The union narrows the payload; build the narrowest valid one per type.
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
        payload: { verdict: 'pass', confidence: 0.9, verdictText: '' },
      };
    case 'step.retry':
      return {
        id,
        type,
        stepNumber: 1,
        timestamp: iso,
        payload: { reason: '', previousVerdictText: '' },
      };
    case 'worker_dialogue':
      return {
        id,
        type,
        stepNumber: 1,
        timestamp: iso,
        payload: { transcript: 't', intent: 'describe_problem', severity: null, aiResponse: null },
      };
    case 'safety_alert':
      return {
        id,
        type,
        stepNumber: 1,
        timestamp: iso,
        payload: {
          severity: 'critical',
          summary: 's',
          recommendedAction: 'r',
          detectedBy: 'ai',
        },
      };
  }
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

describe('ReplayTimeline', () => {
  it('renders one button per event with the right data-event-type', () => {
    const events: ReplayEvent[] = [
      evt('a', 'session.started', '2026-06-06T10:00:00Z'),
      evt('b', 'step.photo_captured', '2026-06-06T10:00:10Z'),
      evt('c', 'step.verified', '2026-06-06T10:00:20Z'),
    ];
    act(() => {
      root.render(
        <ReplayTimeline events={events} selectedEventId={null} onSelectEvent={() => undefined} />,
      );
    });
    const dots = container.querySelectorAll('[data-event-type]');
    expect(dots).toHaveLength(3);
    expect(dots[0]!.getAttribute('data-event-type')).toBe('session.started');
    expect(dots[2]!.getAttribute('data-event-type')).toBe('step.verified');
  });

  it('clicking a dot calls onSelectEvent with that id', () => {
    const events: ReplayEvent[] = [
      evt('a', 'session.started', '2026-06-06T10:00:00Z'),
      evt('b', 'step.photo_captured', '2026-06-06T10:00:10Z'),
      evt('c', 'step.verified', '2026-06-06T10:00:20Z'),
    ];
    const onSelect = vi.fn();
    act(() => {
      root.render(
        <ReplayTimeline events={events} selectedEventId={null} onSelectEvent={onSelect} />,
      );
    });
    const middle = container.querySelector('[data-testid="replay-dot-b"]') as HTMLButtonElement;
    expect(middle).toBeTruthy();
    act(() => {
      middle.click();
    });
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('shows the scrubber line when an event is selected', () => {
    const events: ReplayEvent[] = [
      evt('a', 'session.started', '2026-06-06T10:00:00Z'),
      evt('b', 'step.photo_captured', '2026-06-06T10:00:10Z'),
    ];
    act(() => {
      root.render(
        <ReplayTimeline events={events} selectedEventId="b" onSelectEvent={() => undefined} />,
      );
    });
    expect(container.querySelector('[data-testid="replay-timeline-scrubber"]')).toBeTruthy();
  });

  it('hides the scrubber line when nothing is selected', () => {
    const events: ReplayEvent[] = [evt('a', 'session.started', '2026-06-06T10:00:00Z')];
    act(() => {
      root.render(
        <ReplayTimeline events={events} selectedEventId={null} onSelectEvent={() => undefined} />,
      );
    });
    expect(container.querySelector('[data-testid="replay-timeline-scrubber"]')).toBeFalsy();
  });

  it('renders the empty state when there are no events', () => {
    act(() => {
      root.render(
        <ReplayTimeline events={[]} selectedEventId={null} onSelectEvent={() => undefined} />,
      );
    });
    expect(container.querySelector('[data-testid="replay-timeline-empty"]')).toBeTruthy();
  });

  it('renders 10 dots for 10 events; filtering to 3 renders 3', () => {
    const events: ReplayEvent[] = Array.from({ length: 10 }, (_, i) =>
      evt(`e${i}`, 'step.photo_captured', new Date(2026, 5, 6, 10, 0, i * 5).toISOString()),
    );
    act(() => {
      root.render(
        <ReplayTimeline events={events} selectedEventId={null} onSelectEvent={() => undefined} />,
      );
    });
    expect(container.querySelectorAll('[data-event-type]')).toHaveLength(10);

    act(() => {
      root.render(
        <ReplayTimeline
          events={events.slice(0, 3)}
          selectedEventId={null}
          onSelectEvent={() => undefined}
        />,
      );
    });
    expect(container.querySelectorAll('[data-event-type]')).toHaveLength(3);
  });
});
