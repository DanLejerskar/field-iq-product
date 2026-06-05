/**
 * Tests for createUseVoiceInput. We exercise the factory directly with a
 * minimal hook-deps stub rather than pulling in a React/Preact render
 * harness — same approach as mode-config's hook tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUseVoiceInput, type VoiceHooks, type VoiceInputState } from './voice.js';

interface FakeRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((event: { results: ReadonlyArray<{ isFinal: boolean; 0: { transcript: string } }> }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  __fireResult: (transcript: string, isFinal?: boolean) => void;
  __fireError: (error: string) => void;
  __fireEnd: () => void;
}

let createdRecognitions: FakeRecognition[];

function FakeSpeechRecognitionCtor(): FakeRecognition {
  const r: FakeRecognition = {
    lang: '',
    interimResults: false,
    continuous: false,
    onresult: null,
    onerror: null,
    onend: null,
    start: vi.fn(),
    stop: vi.fn(),
    __fireResult(transcript, isFinal = true) {
      const event = {
        results: [
          {
            isFinal,
            length: 1,
            0: { transcript },
          },
        ] as unknown as ReadonlyArray<{ isFinal: boolean; 0: { transcript: string } }>,
      };
      this.onresult?.(event);
    },
    __fireError(error) {
      this.onerror?.({ error });
    },
    __fireEnd() {
      this.onend?.();
    },
  };
  createdRecognitions.push(r);
  return r;
}

/** Minimal hook deps that record state changes synchronously. */
function makeHookDeps(): {
  hooks: VoiceHooks;
  state: VoiceInputState;
  refs: { current: unknown }[];
  effectCleanups: Array<() => void>;
  runEffects: () => void;
} {
  let state: VoiceInputState = { listening: false, transcript: '', error: null };
  const refs: { current: unknown }[] = [];
  const queuedEffects: Array<() => void | (() => void)> = [];
  const effectCleanups: Array<() => void> = [];

  const hooks: VoiceHooks = {
    useState<S>(initial: S | (() => S)): [S, (next: S | ((prev: S) => S)) => void] {
      const init = typeof initial === 'function' ? (initial as () => S)() : (initial as S);
      // Single state slot for the hook (the factory only calls useState once).
      state = init as unknown as VoiceInputState;
      const setter = (next: S | ((prev: S) => S)): void => {
        const prev = state as unknown as S;
        const v = typeof next === 'function' ? (next as (p: S) => S)(prev) : (next as S);
        state = v as unknown as VoiceInputState;
      };
      return [init, setter];
    },
    useEffect(effect: () => void | (() => void)): void {
      queuedEffects.push(effect);
    },
    useCallback<T extends (...args: never[]) => unknown>(fn: T): T {
      return fn;
    },
    useRef<T>(initial: T): { current: T } {
      const r = { current: initial };
      refs.push(r as { current: unknown });
      return r;
    },
  };

  return {
    hooks,
    get state() {
      return state;
    },
    refs,
    effectCleanups,
    runEffects() {
      while (queuedEffects.length > 0) {
        const e = queuedEffects.shift()!;
        const cleanup = e();
        if (typeof cleanup === 'function') effectCleanups.push(cleanup);
      }
    },
  };
}

beforeEach(() => {
  createdRecognitions = [];
  // Install the fake on window. jsdom provides `window`.
  (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition =
    FakeSpeechRecognitionCtor as unknown as new () => unknown;
});

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});

describe('createUseVoiceInput', () => {
  it('start() flips listening to true and constructs a recognition', () => {
    const deps = makeHookDeps();
    const useVoiceInput = createUseVoiceInput(deps.hooks);
    const { start } = useVoiceInput();
    deps.runEffects();
    expect(deps.state.listening).toBe(false);

    start();

    expect(deps.state.listening).toBe(true);
    expect(deps.state.error).toBeNull();
    expect(createdRecognitions).toHaveLength(1);
    expect(createdRecognitions[0]!.lang).toBe('en-US');
  });

  it('onresult populates state.transcript', () => {
    const deps = makeHookDeps();
    const { start } = createUseVoiceInput(deps.hooks)();
    deps.runEffects();
    start();

    const recognition = createdRecognitions[0]!;
    recognition.__fireResult('what is next');

    expect(deps.state.transcript).toBe('what is next');
    expect(deps.state.listening).toBe(true);
  });

  it('stop() flips listening to false', () => {
    const deps = makeHookDeps();
    const { start, stop } = createUseVoiceInput(deps.hooks)();
    deps.runEffects();
    start();
    expect(deps.state.listening).toBe(true);

    stop();

    expect(deps.state.listening).toBe(false);
    expect(createdRecognitions[0]!.stop).toHaveBeenCalled();
  });

  it('onerror records the error and flips listening off', () => {
    const deps = makeHookDeps();
    const { start } = createUseVoiceInput(deps.hooks)();
    deps.runEffects();
    start();

    createdRecognitions[0]!.__fireError('no-speech');

    expect(deps.state.error).toBe('no-speech');
    expect(deps.state.listening).toBe(false);
  });

  it('onend flips listening off and clears the recognition ref', () => {
    const deps = makeHookDeps();
    const { start } = createUseVoiceInput(deps.hooks)();
    deps.runEffects();
    start();
    createdRecognitions[0]!.__fireEnd();
    expect(deps.state.listening).toBe(false);
  });

  it('falls back to webkitSpeechRecognition when SpeechRecognition is absent', () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition =
      FakeSpeechRecognitionCtor as unknown as new () => unknown;

    const deps = makeHookDeps();
    const { start } = createUseVoiceInput(deps.hooks)();
    deps.runEffects();
    start();

    expect(deps.state.listening).toBe(true);
    expect(createdRecognitions).toHaveLength(1);
  });

  it("error: 'unsupported' when neither global is present, no recognition constructed", () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;

    const deps = makeHookDeps();
    const { start } = createUseVoiceInput(deps.hooks)();
    deps.runEffects();
    start();

    expect(deps.state.error).toBe('unsupported');
    expect(deps.state.listening).toBe(false);
    expect(createdRecognitions).toHaveLength(0);
  });

  it('start() is a no-op when a recognition is already active', () => {
    const deps = makeHookDeps();
    const { start } = createUseVoiceInput(deps.hooks)();
    deps.runEffects();
    start();
    start();
    start();
    expect(createdRecognitions).toHaveLength(1);
  });

  it('unmount cleanup stops the recognition', () => {
    const deps = makeHookDeps();
    const { start } = createUseVoiceInput(deps.hooks)();
    deps.runEffects();
    start();
    expect(deps.state.listening).toBe(true);

    for (const c of deps.effectCleanups) c();

    expect(createdRecognitions[0]!.stop).toHaveBeenCalled();
  });
});
