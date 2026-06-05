/**
 * Framework-agnostic voice input factory wrapping the browser's Web Speech
 * API. Feature-detects both `SpeechRecognition` and `webkitSpeechRecognition`
 * — gracefully no-ops with `error: 'unsupported'` when neither is present.
 *
 * The factory takes a hook-shaped `hooks` parameter so both React and Preact
 * can wire it up via their own `useState` / `useEffect` / `useCallback` /
 * `useRef`. Mirrors the mode-config pattern.
 */

export interface VoiceInputState {
  listening: boolean;
  transcript: string;
  error: string | null;
}

export interface VoiceInputActions {
  start: () => void;
  stop: () => void;
}

export type UseVoiceInput = () => VoiceInputState & VoiceInputActions;

/** Hook-shaped dependencies both React and Preact provide. */
export interface VoiceHooks {
  useState: <S>(initial: S | (() => S)) => [S, (next: S | ((prev: S) => S)) => void];
  useEffect: (effect: () => void | (() => void), deps?: ReadonlyArray<unknown>) => void;
  useCallback: <T extends (...args: never[]) => unknown>(fn: T, deps: ReadonlyArray<unknown>) => T;
  useRef: <T>(initial: T) => { current: T };
}

/** Minimal SpeechRecognition shape — both Chrome's and the W3C standard. */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: SpeechRecognitionResultListLike }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: { transcript: string };
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const INITIAL_STATE: VoiceInputState = { listening: false, transcript: '', error: null };

export function createUseVoiceInput(hooks: VoiceHooks): UseVoiceInput {
  return function useVoiceInput(): VoiceInputState & VoiceInputActions {
    const [state, setState] = hooks.useState<VoiceInputState>(INITIAL_STATE);
    const recognitionRef = hooks.useRef<SpeechRecognitionLike | null>(null);

    // Tear down the recognition on unmount.
    hooks.useEffect(() => {
      return () => {
        const r = recognitionRef.current;
        if (r) {
          try {
            r.stop();
          } catch {
            /* already stopped */
          }
          recognitionRef.current = null;
        }
      };
    }, []);

    const start = hooks.useCallback(
      (() => {
        // Already running — no-op.
        if (recognitionRef.current) return;

        const Ctor = getSpeechRecognitionCtor();
        if (!Ctor) {
          setState({ listening: false, transcript: '', error: 'unsupported' });
          return;
        }

        let recognition: SpeechRecognitionLike;
        try {
          recognition = new Ctor();
        } catch (err) {
          setState({
            listening: false,
            transcript: '',
            error: err instanceof Error ? err.message : 'construct-failed',
          });
          return;
        }

        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.continuous = false;

        recognition.onresult = (event): void => {
          const finals: string[] = [];
          const results = event.results;
          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            if (r && r.isFinal && r.length > 0) {
              const alt = r[0];
              if (alt) finals.push(alt.transcript);
            }
          }
          if (finals.length === 0) return;
          const joined = finals.join(' ').trim();
          setState((prev) => ({ ...prev, transcript: joined }));
        };

        recognition.onerror = (event): void => {
          setState((prev) => ({ ...prev, listening: false, error: event.error || 'unknown' }));
        };

        recognition.onend = (): void => {
          setState((prev) => ({ ...prev, listening: false }));
          recognitionRef.current = null;
        };

        recognitionRef.current = recognition;
        try {
          recognition.start();
          setState({ listening: true, transcript: '', error: null });
        } catch (err) {
          recognitionRef.current = null;
          setState({
            listening: false,
            transcript: '',
            error: err instanceof Error ? err.message : 'start-failed',
          });
        }
      }) as () => void,
      [],
    );

    const stop = hooks.useCallback(
      (() => {
        const r = recognitionRef.current;
        if (!r) {
          setState((prev) => ({ ...prev, listening: false }));
          return;
        }
        try {
          r.stop();
        } catch {
          /* swallow — onend will fire if it can */
        }
        setState((prev) => ({ ...prev, listening: false }));
      }) as () => void,
      [],
    );

    return { ...state, start, stop };
  };
}
