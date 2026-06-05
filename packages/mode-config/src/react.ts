/**
 * React 18+ entry. Pre-binds `useMode` and `ModeToggle` to React's runtime.
 *
 * Usage in the dashboard:
 *   import { useMode, ModeToggle } from '@field-iq/mode-config/react';
 *
 * Re-exports the core types/policy/storage from `./index.js` so consumers only
 * need a single import path.
 */
import { createElement, useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { createModeToggle, type ModeToggleProps } from './ModeToggle.js';
import { createUseMode } from './useMode.js';

export * from './index.js';

export const useMode = createUseMode({ useState, useEffect, useCallback });

export const ModeToggle: (props: ModeToggleProps) => ReactElement = createModeToggle<ReactElement>(
  createElement as never,
  { useCallback },
);
