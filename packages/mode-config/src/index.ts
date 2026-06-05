/**
 * Core entry point — framework-agnostic types, policy, persistence, and the
 * `createUseMode` / `createModeToggle` factories.
 *
 * Consumers picking a runtime should import from `@field-iq/mode-config/react`
 * or `@field-iq/mode-config/preact` instead — they re-export everything here
 * plus the pre-bound `useMode` hook and `ModeToggle` component.
 */
export * from './types.js';
export * from './policy.js';
export * from './storage.js';
export { createUseMode } from './useMode.js';
export type { ModeHooks, UseModeReturn } from './useMode.js';
export { createModeToggle } from './ModeToggle.js';
export type { CreateElement, ModeToggleProps, ToggleHooks } from './ModeToggle.js';
