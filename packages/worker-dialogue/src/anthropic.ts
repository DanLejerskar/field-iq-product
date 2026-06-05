/**
 * Structural Anthropic client type. Matches both the real
 * `@anthropic-ai/sdk` `Anthropic` instance and the vi.fn-backed test stubs,
 * so this package doesn't hard-require the SDK at runtime.
 *
 * Same shape as the one in `@field-iq/equipment-recognizer/src/vision.ts` —
 * intentionally duplicated rather than cross-imported so the two packages
 * stay independent.
 */
export interface AnthropicMessagesClient {
  messages: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
}

export const DEFAULT_MODEL = 'claude-sonnet-4-6';

/** Strip optional ```json fences before parsing. */
export const FENCE_RE: RegExp = /^```(?:json)?\s*\n?|\n?```\s*$/gm;

/** Concatenate all `type: 'text'` blocks from a Claude response. */
export function extractText(response: unknown): string {
  if (!response || typeof response !== 'object') return '';
  const content = (response as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as { type?: unknown; text?: unknown };
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text);
  }
  return parts.join('');
}
