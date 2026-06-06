/**
 * Left-rail vertical list of all visible events. Click a row → select it.
 */
import type { ReplayEvent } from '../../api/replay';
import { EVENT_STYLES } from './eventStyles';

interface Props {
  events: ReplayEvent[];
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
  sessionStartIso: string;
}

function relativeTime(timestamp: string, start: string): string {
  const dt = Math.max(0, Date.parse(timestamp) - Date.parse(start));
  const sec = Math.floor(dt / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s in`;
}

export function ReplayEventList({
  events,
  selectedEventId,
  onSelectEvent,
  sessionStartIso,
}: Props) {
  if (events.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          color: 'var(--ink-faint)',
          fontSize: 12,
        }}
      >
        No events match the current filters.
      </div>
    );
  }

  return (
    <ul
      data-testid="replay-event-list"
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        overflowY: 'auto',
        height: '100%',
      }}
    >
      {events.map((event) => {
        const style = EVENT_STYLES[event.type];
        const selected = event.id === selectedEventId;
        return (
          <li key={event.id}>
            <button
              type="button"
              data-testid={`replay-event-row-${event.id}`}
              onClick={() => onSelectEvent(event.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 12px',
                background: selected ? 'var(--bg-hover)' : 'transparent',
                border: 'none',
                borderLeft: selected ? `3px solid ${style.color}` : '3px solid transparent',
                color: 'var(--ink)',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 12,
              }}
            >
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: style.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: selected ? 600 : 500 }}>
                  {style.label}
                  {event.stepNumber !== null ? (
                    <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>
                      {' '}
                      · step {event.stepNumber}
                    </span>
                  ) : null}
                </div>
                <div style={{ color: 'var(--ink-faint)', fontSize: 11 }}>
                  {relativeTime(event.timestamp, sessionStartIso)}
                </div>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
