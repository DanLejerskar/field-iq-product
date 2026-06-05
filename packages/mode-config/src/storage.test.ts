import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMode, loadMode, saveMode, STORAGE_KEY } from './storage.js';
import { DEFAULT_MODE } from './types.js';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('loadMode', () => {
  it('returns DEFAULT_MODE when nothing is stored', () => {
    expect(loadMode()).toBe(DEFAULT_MODE);
  });

  it('returns DEFAULT_MODE when storage holds a corrupted value', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-a-mode');
    expect(loadMode()).toBe(DEFAULT_MODE);
  });

  it('returns DEFAULT_MODE when window is undefined (SSR-safe)', () => {
    const original = globalThis.window;
    // jsdom always sets window; simulate SSR by clobbering it.
    vi.stubGlobal('window', undefined);
    try {
      expect(loadMode()).toBe(DEFAULT_MODE);
    } finally {
      vi.stubGlobal('window', original);
    }
  });

  it('returns DEFAULT_MODE when getItem throws', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage locked');
    });
    try {
      expect(loadMode()).toBe(DEFAULT_MODE);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('saveMode + loadMode round-trip', () => {
  it('persists walkthrough', () => {
    saveMode('walkthrough');
    expect(loadMode()).toBe('walkthrough');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('walkthrough');
  });

  it('persists standby', () => {
    saveMode('standby');
    expect(loadMode()).toBe('standby');
  });

  it('saveMode is a no-op when window is undefined', () => {
    const original = globalThis.window;
    vi.stubGlobal('window', undefined);
    try {
      expect(() => saveMode('standby')).not.toThrow();
    } finally {
      vi.stubGlobal('window', original);
    }
  });

  it('saveMode swallows setItem errors (quota / locked storage)', () => {
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    try {
      expect(() => saveMode('standby')).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('clearMode', () => {
  it('resets to DEFAULT_MODE on next load', () => {
    saveMode('standby');
    expect(loadMode()).toBe('standby');
    clearMode();
    expect(loadMode()).toBe(DEFAULT_MODE);
  });

  it('is a no-op when window is undefined', () => {
    const original = globalThis.window;
    vi.stubGlobal('window', undefined);
    try {
      expect(() => clearMode()).not.toThrow();
    } finally {
      vi.stubGlobal('window', original);
    }
  });
});
