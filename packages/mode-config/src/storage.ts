/**
 * Optional localStorage persistence for the user's last-chosen session mode.
 *
 * Safe in SSR / non-browser contexts: every function checks for `window`
 * before touching storage and returns the default on any error. Keys are
 * shared with the rest of Field IQ's localStorage namespace (`field_iq_*`).
 */
import { isValidMode } from './policy.js';
import { DEFAULT_MODE, type SessionMode } from './types.js';

export const STORAGE_KEY = 'field_iq_session_mode';

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadMode(): SessionMode {
  const storage = safeStorage();
  if (!storage) return DEFAULT_MODE;
  try {
    const v = storage.getItem(STORAGE_KEY);
    return isValidMode(v) ? v : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export function saveMode(mode: SessionMode): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, mode);
  } catch {
    /* swallow — quota exceeded, locked storage, etc. */
  }
}

export function clearMode(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* swallow */
  }
}
