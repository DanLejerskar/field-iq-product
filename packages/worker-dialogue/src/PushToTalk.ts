/**
 * Framework-agnostic PushToTalk button factory.
 *
 * Hold-to-talk gesture: pointer-down / Space-down → `start()`,
 * pointer-up / leave / Space-up → `stop()`. When listening ends with a
 * non-empty transcript, fires `onTranscript(transcript)`.
 *
 * Visual states:
 *   - idle:      navy bg + cream microphone icon.
 *   - listening: terracotta bg + pulsing ring.
 *   - error:     gray bg + red dot.
 *
 * Accessibility:
 *   - role="button", aria-pressed={listening}, aria-label="Hold to talk".
 *   - Keyboard fallback (Space): hold-and-release matches pointer gestures.
 *
 * Same factory pattern as mode-config's `createModeToggle` — takes the
 * runtime's `createElement` so the same compiled JS works for both React
 * and Preact.
 */
import type { UseVoiceInput } from './voice.js';

export interface PushToTalkProps {
  onTranscript: (transcript: string) => void;
  disabled?: boolean;
  /** Optional override of the runtime's wired useVoiceInput. */
  useVoiceInput?: UseVoiceInput;
}

export type CreateElement<E> = (
  type: string,
  props: Record<string, unknown> | null,
  ...children: Array<E | string | number | null | undefined | boolean>
) => E;

export interface PushToTalkHooks {
  useState: <S>(initial: S | (() => S)) => [S, (next: S | ((prev: S) => S)) => void];
  useEffect: (effect: () => void | (() => void), deps?: ReadonlyArray<unknown>) => void;
  useCallback: <T extends (...args: never[]) => unknown>(fn: T, deps: ReadonlyArray<unknown>) => T;
  useRef: <T>(initial: T) => { current: T };
}

const COLOR = {
  navy: '#1E2761',
  cream: '#F5F1EA',
  terracotta: '#B85042',
  gray: '#6B7689',
  red: '#E0625C',
} as const;

function micIconChildren<E>(create: CreateElement<E>): E[] {
  return [
    create('path', {
      d: 'M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zM19 11a7 7 0 0 1-14 0M12 18v3M8 21h8',
      stroke: COLOR.cream,
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      fill: 'none',
    }),
  ];
}

function styleFor(listening: boolean, error: boolean, disabled: boolean): Record<string, unknown> {
  const bg = error ? COLOR.gray : listening ? COLOR.terracotta : COLOR.navy;
  return {
    position: 'relative',
    width: 72,
    height: 72,
    borderRadius: '50%',
    border: 'none',
    background: bg,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    color: COLOR.cream,
    outline: 'none',
    boxShadow: listening ? `0 0 0 0 ${COLOR.terracotta}55` : '0 2px 6px rgba(0,0,0,0.25)',
    animation: listening ? 'fieldiq-pulse 1.2s ease-out infinite' : undefined,
    transition: 'background 120ms',
  };
}

const PULSE_KEYFRAMES =
  '@keyframes fieldiq-pulse { 0% { box-shadow: 0 0 0 0 ' +
  COLOR.terracotta +
  '88; } 100% { box-shadow: 0 0 0 18px ' +
  COLOR.terracotta +
  '00; } }';

export function createPushToTalk<E>(
  create: CreateElement<E>,
  hooks: PushToTalkHooks,
  defaultUseVoiceInput: UseVoiceInput,
): (props: PushToTalkProps) => E {
  return function PushToTalk({
    onTranscript,
    disabled = false,
    useVoiceInput,
  }: PushToTalkProps): E {
    const useHook = useVoiceInput ?? defaultUseVoiceInput;
    const { listening, transcript, error, start, stop } = useHook();
    const wasListeningRef = hooks.useRef(false);

    // Fire onTranscript on the falling edge of `listening` when a transcript
    // was captured. Avoids firing on the initial render or on bare stops.
    hooks.useEffect(() => {
      if (wasListeningRef.current && !listening && transcript.trim().length > 0) {
        onTranscript(transcript);
      }
      wasListeningRef.current = listening;
    }, [listening, transcript, onTranscript]);

    const press = hooks.useCallback(
      (() => {
        if (disabled) return;
        start();
      }) as () => void,
      [disabled, start],
    );

    const release = hooks.useCallback(
      (() => {
        if (disabled) return;
        stop();
      }) as () => void,
      [disabled, stop],
    );

    const onKeyDown = hooks.useCallback(
      ((e: KeyboardEvent): void => {
        if (disabled) return;
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          start();
        }
      }) as (...args: never[]) => void,
      [disabled, start],
    );

    const onKeyUp = hooks.useCallback(
      ((e: KeyboardEvent): void => {
        if (disabled) return;
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          stop();
        }
      }) as (...args: never[]) => void,
      [disabled, stop],
    );

    const errorActive = !!error;

    const indicator = errorActive
      ? create('span', {
          style: {
            position: 'absolute',
            top: 8,
            right: 8,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: COLOR.red,
            display: 'inline-block',
          },
          'aria-hidden': 'true',
        })
      : null;

    const svg = create(
      'svg',
      {
        width: 28,
        height: 28,
        viewBox: '0 0 24 24',
        'aria-hidden': 'true',
      },
      ...micIconChildren(create),
    );

    const keyframes = create('style', null, PULSE_KEYFRAMES);

    return create(
      'button',
      {
        type: 'button',
        role: 'button',
        'aria-pressed': listening,
        'aria-label': 'Hold to talk',
        'aria-disabled': disabled,
        disabled,
        tabIndex: 0,
        style: styleFor(listening, errorActive, disabled),
        onPointerDown: press,
        onPointerUp: release,
        onPointerLeave: release,
        onPointerCancel: release,
        onKeyDown,
        onKeyUp,
      },
      keyframes,
      svg,
      indicator,
    );
  };
}
