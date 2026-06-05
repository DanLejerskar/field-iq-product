/**
 * @field-iq/worker-dialogue — voice + text dialogue with the worker.
 *
 * Core entry: framework-agnostic. Types, classifier, handler, structural
 * Anthropic client type, and the `createUseVoiceInput` / `createPushToTalk`
 * factories.
 *
 * Consumers picking a runtime should import from
 * `@field-iq/worker-dialogue/react` or `/preact` instead — those re-export
 * everything here plus pre-bound `useVoiceInput` and `PushToTalk`.
 */
export * from './types.js';
export type { AnthropicMessagesClient } from './anthropic.js';
export {
  classify,
  hitsCriticalKeyword,
  WHATS_NEXT_PHRASES,
  PROBLEM_PHRASES,
  CRITICAL_PHRASES,
  type ClassifyDeps,
} from './classify.js';
export { handle, type HandleDeps } from './handle.js';
export {
  createUseVoiceInput,
  type VoiceInputState,
  type VoiceInputActions,
  type VoiceHooks,
  type UseVoiceInput,
} from './voice.js';
export {
  createPushToTalk,
  type CreateElement,
  type PushToTalkHooks,
  type PushToTalkProps,
} from './PushToTalk.js';
