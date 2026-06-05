/**
 * Preact 10+ entry. Pre-binds `useMode` and `ModeToggle` to Preact's runtime.
 *
 * Usage in the glasses-webapp:
 *   import { useMode, ModeToggle } from '@field-iq/mode-config/preact';
 *
 * Re-exports the core types/policy/storage from `./index.js` so consumers only
 * need a single import path.
 */
import { h } from 'preact';
import type { VNode } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { createModeToggle, type ModeToggleProps } from './ModeToggle.js';
import { createUseMode } from './useMode.js';

export * from './index.js';

export const useMode = createUseMode({ useState, useEffect, useCallback });

export const ModeToggle: (props: ModeToggleProps) => VNode = createModeToggle<VNode>(h as never, {
  useCallback,
});
