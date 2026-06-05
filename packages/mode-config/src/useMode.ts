/**
 * Framework-agnostic core hook factory.
 *
 * Both React and Preact ship a `useState` / `useEffect` / `useCallback` triple
 * with identical signatures, but importing either one bakes that runtime into
 * this package. We dodge that by exposing a `createUseMode(hooks)` factory and
 * letting the `./react` and `./preact` entry points wire in their own hooks.
 *
 * Returned shape:
 *   - `mode`     — the active SessionMode (initial value from localStorage).
 *   - `behavior` — derived from `behaviorFor(mode)` on every render.
 *   - `setMode`  — persists to localStorage AND updates local state.
 *
 * A `storage` event listener keeps multiple tabs in sync: changing the mode in
 * tab A reflects in tab B on the next render.
 */
import { behaviorFor } from './policy.js';
import { STORAGE_KEY, loadMode, saveMode } from './storage.js';
import type { ModeBehavior, SessionMode } from './types.js';

export interface UseModeReturn {
  mode: SessionMode;
  behavior: ModeBehavior;
  setMode: (next: SessionMode) => void;
}

/** The hook-shaped dependencies React and Preact both provide. */
export interface ModeHooks {
  useState: <S>(initial: S | (() => S)) => [S, (next: S | ((prev: S) => S)) => void];
  useEffect: (effect: () => void | (() => void), deps?: ReadonlyArray<unknown>) => void;
  useCallback: <T extends (...args: never[]) => unknown>(fn: T, deps: ReadonlyArray<unknown>) => T;
}

export function createUseMode(hooks: ModeHooks): () => UseModeReturn {
  return function useMode(): UseModeReturn {
    const [mode, setModeState] = hooks.useState<SessionMode>(() => loadMode());

    hooks.useEffect(() => {
      if (typeof window === 'undefined') return;
      const onStorage = (e: StorageEvent): void => {
        if (e.key === STORAGE_KEY) setModeState(loadMode());
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    }, []);

    const setMode = hooks.useCallback((next: SessionMode): void => {
      saveMode(next);
      setModeState(next);
    }, []);

    return { mode, behavior: behaviorFor(mode), setMode };
  };
}
