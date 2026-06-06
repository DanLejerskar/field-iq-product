/**
 * Five checkboxes for the user-facing event types. Lifecycle events
 * (session.started, step.started, session.ended) are always shown.
 */
import type { ReplayEventType } from '../../api/replay';
import { EVENT_STYLES, FILTERABLE_TYPES } from './eventStyles';

export type Filters = Record<ReplayEventType, boolean>;

export function makeDefaultFilters(): Filters {
  // True for every type — lifecycle events aren't toggleable but it's
  // easier to set them true here than to special-case them everywhere.
  return Object.fromEntries(
    (Object.keys(EVENT_STYLES) as ReplayEventType[]).map((t) => [t, true]),
  ) as Filters;
}

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export function ReplayFilters({ filters, onChange }: Props) {
  function toggle(type: ReplayEventType): void {
    onChange({ ...filters, [type]: !filters[type] });
  }

  return (
    <div
      role="group"
      aria-label="Event type filters"
      style={{
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
        padding: '8px 12px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 6,
      }}
    >
      {FILTERABLE_TYPES.map((type) => {
        const style = EVENT_STYLES[type];
        const checked = filters[type];
        return (
          <label
            key={type}
            data-testid={`replay-filter-${type}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              color: 'var(--ink)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(type)}
              aria-label={`Toggle ${style.label}`}
            />
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: style.color,
              }}
            />
            <span>{style.label}</span>
          </label>
        );
      })}
    </div>
  );
}
