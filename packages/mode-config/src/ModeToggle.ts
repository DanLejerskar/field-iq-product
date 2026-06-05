/**
 * Framework-agnostic ModeToggle factory.
 *
 * The visual contract: a row of two pill buttons. Active pill has the navy
 * background + white text + terracotta border-bottom; inactive is ice-blue
 * with navy text. Border-radius 100px on both.
 *
 * Why a factory instead of a `.tsx` file with a JSX pragma? The prompt offered
 * both routes; the pragma approach bakes one runtime in (you can't reuse the
 * same compiled JS from React AND Preact consumers). Calling `createElement`
 * (React) / `h` (Preact) directly via the factory is the genuinely
 * runtime-agnostic path.
 *
 * Keyboard:
 *   - ArrowLeft / ArrowRight cycle modes.
 *   - Enter / Space activate (toggle).
 *
 * Accessibility:
 *   - Container is `role="group"` with `aria-label="Session mode"`.
 *   - Each pill is a real `<button>` with `aria-pressed`.
 */
import type { SessionMode } from './types.js';

export interface ModeToggleProps {
  mode: SessionMode;
  onChange: (next: SessionMode) => void;
  disabled?: boolean;
}

/** Minimal `createElement` signature both React and Preact match. */
export type CreateElement<E> = (
  type: string,
  props: Record<string, unknown> | null,
  ...children: Array<E | string | number | null | undefined | boolean>
) => E;

/** Just the one hook ModeToggle needs. */
export interface ToggleHooks {
  useCallback: <T extends (...args: never[]) => unknown>(fn: T, deps: ReadonlyArray<unknown>) => T;
}

const COLOR = {
  navy: '#1E2761',
  ice: '#CADCFC',
  accent: '#B85042',
  white: '#FFFFFF',
} as const;

function pillStyle(active: boolean, disabled: boolean): Record<string, string | number> {
  return {
    padding: '8px 20px',
    borderRadius: 100,
    border: 'none',
    borderBottom: active ? `3px solid ${COLOR.accent}` : '3px solid transparent',
    background: active ? COLOR.navy : COLOR.ice,
    color: active ? COLOR.white : COLOR.navy,
    fontWeight: 600,
    fontSize: 14,
    lineHeight: 1.2,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'background 120ms, color 120ms, border-bottom-color 120ms',
  };
}

function otherMode(m: SessionMode): SessionMode {
  return m === 'walkthrough' ? 'standby' : 'walkthrough';
}

export function createModeToggle<E>(
  createElement: CreateElement<E>,
  hooks: ToggleHooks,
): (props: ModeToggleProps) => E {
  return function ModeToggle({ mode, onChange, disabled = false }: ModeToggleProps): E {
    const handleKey = hooks.useCallback(
      ((e: KeyboardEvent): void => {
        if (disabled) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          onChange(otherMode(mode));
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(otherMode(mode));
        }
      }) as (...args: never[]) => void,
      [mode, onChange, disabled],
    );

    const pill = (m: SessionMode, label: string): E => {
      const active = mode === m;
      return createElement(
        'button',
        {
          type: 'button',
          'aria-pressed': active,
          disabled,
          onClick: disabled ? undefined : () => onChange(m),
          onKeyDown: handleKey,
          style: pillStyle(active, disabled),
        },
        label,
      );
    };

    return createElement(
      'div',
      {
        role: 'group',
        'aria-label': 'Session mode',
        style: { display: 'inline-flex', gap: 8 },
      },
      pill('walkthrough', 'Walk-me-through'),
      pill('standby', 'Stand-by'),
    );
  };
}
