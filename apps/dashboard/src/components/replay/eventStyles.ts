/**
 * Single source of truth for the visual treatment of each ReplayEventType.
 *
 * Pages + components branch on these instead of hard-coding event-type
 * strings inside JSX. `filterable: true` means the type shows up as a
 * checkbox in the filter bar; `false` (lifecycle events) is always rendered.
 */
import type { ReplayEventType } from '../../api/replay';

export interface EventStyle {
  /** Hex color for the dot + accent. */
  color: string;
  /** Short label for tooltips + the legend. */
  label: string;
  /** Single-char SVG-friendly glyph rendered inside the dot. */
  glyph: string;
  /** Whether this event type appears in the filter bar (true = filterable). */
  filterable: boolean;
}

export const EVENT_STYLES: Record<ReplayEventType, EventStyle> = {
  'session.started': {
    color: '#6B7689',
    label: 'Session started',
    glyph: '▶',
    filterable: false,
  },
  'step.started': {
    color: '#6B7689',
    label: 'Step started',
    glyph: '·',
    filterable: false,
  },
  'step.photo_captured': {
    color: '#5BA8D6',
    label: 'Photo',
    glyph: '◉',
    filterable: true,
  },
  'step.verified': {
    color: '#10B981',
    label: 'Verdict',
    glyph: '✓',
    filterable: true,
  },
  'step.retry': {
    color: '#F0B23A',
    label: 'Retry',
    glyph: '↻',
    filterable: true,
  },
  worker_dialogue: {
    color: '#A78BFA',
    label: 'Worker voice',
    glyph: '🎙',
    filterable: true,
  },
  safety_alert: {
    color: '#E0625C',
    label: 'Safety alert',
    glyph: '⚠',
    filterable: true,
  },
  'session.ended': {
    color: '#6B7689',
    label: 'Session ended',
    glyph: '■',
    filterable: false,
  },
};

/** Filterable types in display order. Drives the checkbox bar + EventList. */
export const FILTERABLE_TYPES: ReplayEventType[] = [
  'step.photo_captured',
  'step.verified',
  'step.retry',
  'worker_dialogue',
  'safety_alert',
];
