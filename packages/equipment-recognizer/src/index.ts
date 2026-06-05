/**
 * @field-iq/equipment-recognizer — photo → equipment identification.
 *
 * Two paths, one orchestrator: Claude Vision against a catalog (primary), QR
 * decode + mapping (fallback). Returns a `Recognition` record the backend
 * uses to look up the right procedure.
 */
export * from './types.js';
export { DEFAULT_CATALOG, DEFAULT_QR_MAPPING } from './catalog.js';
export { recognizeFromPhoto, parseDataUri, buildUserPrompt } from './vision.js';
export type { AnthropicMessagesClient, VisionDeps } from './vision.js';
export { decodeQr } from './qr.js';
export type { QrDeps } from './qr.js';
export { recognize } from './recognize.js';
export type { RecognizeDeps } from './recognize.js';
