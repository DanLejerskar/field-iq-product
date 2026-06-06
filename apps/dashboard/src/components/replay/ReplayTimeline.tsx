/**
 * Horizontal timeline scrubber. One row of colored dots per filtered event.
 *
 * Hover a dot → native tooltip with type + relative time. Click → select.
 * The currently selected event gets a ring around it; a vertical scrubber
 * line shows where the time cursor sits.
 */
import type { ReplayEvent } from '../../api/replay';
import { EVENT_STYLES } from './eventStyles';

interface Props {
  events: ReplayEvent[];
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
}

const TIMELINE_HEIGHT = 56;
const DOT_SIZE = 16;

function positionFor(event: ReplayEvent, tMin: number, tMax: number): number {
  const t = Date.parse(event.timestamp);
  if (tMax === tMin) return 0;
  return ((t - tMin) / (tMax - tMin)) * 100;
}

function relativeTime(timestamp: string, sessionStartIso: string): string {
  const dt = Math.max(0, Date.parse(timestamp) - Date.parse(sessionStartIso));
  const sec = Math.floor(dt / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ReplayTimeline({ events, selectedEventId, onSelectEvent }: Props) {
  if (events.length === 0) {
    return (
      <div
        data-testid="replay-timeline-empty"
        style={{
          height: TIMELINE_HEIGHT,
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ink-faint)',
          fontSize: 12,
        }}
      >
        No events to show
      </div>
    );
  }

  const timestamps = events.map((e) => Date.parse(e.timestamp));
  const tMin = Math.min(...timestamps);
  const tMax = Math.max(...timestamps);
  const sessionStartIso = events[0]!.timestamp;
  const selected = events.find((e) => e.id === selectedEventId) ?? null;
  const selectedLeft = selected ? positionFor(selected, tMin, tMax) : null;

  return (
    <div
      data-testid="replay-timeline"
      style={{
        position: 'relative',
        height: TIMELINE_HEIGHT,
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '0 16px',
      }}
    >
      {/* The track line */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          top: TIMELINE_HEIGHT / 2,
          height: 2,
          background: 'var(--border)',
        }}
      />

      {/* Scrubber line for the selected event */}
      {selectedLeft !== null ? (
        <div
          aria-hidden
          data-testid="replay-timeline-scrubber"
          style={{
            position: 'absolute',
            left: `calc(16px + ${selectedLeft}% * (100% - 32px) / 100%)`,
            top: 4,
            bottom: 4,
            width: 1,
            background: 'var(--field)',
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {events.map((event) => {
        const style = EVENT_STYLES[event.type];
        const left = positionFor(event, tMin, tMax);
        const isSelected = event.id === selectedEventId;
        return (
          <button
            key={event.id}
            type="button"
            data-testid={`replay-dot-${event.id}`}
            data-event-type={event.type}
            onClick={() => onSelectEvent(event.id)}
            title={`${style.label} · ${relativeTime(event.timestamp, sessionStartIso)}`}
            aria-label={`${style.label} at ${relativeTime(event.timestamp, sessionStartIso)}`}
            style={{
              position: 'absolute',
              left: `calc(16px + ${left}% * (100% - 32px) / 100%)`,
              top: TIMELINE_HEIGHT / 2 - DOT_SIZE / 2,
              transform: 'translateX(-50%)',
              width: DOT_SIZE,
              height: DOT_SIZE,
              borderRadius: '50%',
              border: 'none',
              background: style.color,
              color: '#fff',
              cursor: 'pointer',
              padding: 0,
              boxShadow: isSelected ? `0 0 0 3px ${style.color}55` : '0 0 0 2px var(--bg-elev)',
              outline: isSelected ? `2px solid ${style.color}` : 'none',
              outlineOffset: 2,
              fontSize: 10,
              lineHeight: `${DOT_SIZE}px`,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {style.glyph}
          </button>
        );
      })}
    </div>
  );
}
