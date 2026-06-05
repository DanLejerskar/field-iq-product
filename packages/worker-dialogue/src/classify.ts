/**
 * Two-stage intent classifier.
 *
 * Stage 1 — keyword match. Fast, free, deterministic. Word-boundary regex
 * matching so "next" matches "what's next" but NOT "context".
 *
 * Stage 2 — Claude fallback. Only consulted when (a) keywords are ambiguous
 * AND (b) the caller provided an `anthropic` client. Reply is constrained to
 * one of the three intent strings; anything else collapses to 'unknown'.
 *
 * Empty / whitespace input → 'unknown'.
 */
import { DEFAULT_MODEL, extractText, type AnthropicMessagesClient } from './anthropic.js';
import type { Intent } from './types.js';

/** Keyword phrases for the fast "what's next" path. Lower-case, whitespace-collapsed. */
export const WHATS_NEXT_PHRASES: readonly string[] = [
  'whats next',
  "what's next",
  'next step',
  'next',
  'what now',
  'okay next',
  'ok next',
  'continue',
  'go on',
  'move on',
  'show me next',
  'whats the next',
  "what's the next",
  'advance',
  'proceed',
];

/** Keyword phrases for the "describe a problem" path. */
export const PROBLEM_PHRASES: readonly string[] = [
  'problem',
  'stuck',
  'broken',
  'not working',
  "isn't working",
  'isnt working',
  "doesn't work",
  'does not work',
  "won't",
  'wont',
  'help',
  "can't",
  'cant',
  'cannot',
  'smells',
  'smell',
  'smoke',
  'smoking',
  'fire',
  'gas',
  'leak',
  'leaking',
  'sparks',
  'sparking',
  'shock',
  'burning',
  'hot',
  'hurt',
  'pain',
  'something wrong',
];

/**
 * Subset of PROBLEM_PHRASES that imply life-safety emergencies. The handler
 * uses this list for its critical-severity fallback when Claude is
 * unreachable or returns malformed output.
 */
export const CRITICAL_PHRASES: readonly string[] = [
  'gas',
  'smoke',
  'smoking',
  'fire',
  'sparks',
  'sparking',
  'shock',
  'burning',
  'hurt',
  'pain',
];

export interface ClassifyDeps {
  /** Optional fallback client. If omitted, ambiguous transcripts → 'unknown'. */
  anthropic?: AnthropicMessagesClient;
  model?: string;
}

const CLAUDE_SYSTEM_PROMPT =
  'You are an intent classifier for an industrial LOTO worker dialogue system. ' +
  'Reply with exactly one token, no punctuation, no explanation: ' +
  '`whats_next` (worker wants the next step), ' +
  '`describe_problem` (worker is reporting a problem with equipment, safety, or procedure), ' +
  'or `unknown` (everything else).';

const VALID_INTENTS: readonly Intent[] = ['whats_next', 'describe_problem', 'unknown'];

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Word-boundary match: a phrase hits only when it appears as whole word(s). */
function phraseHits(norm: string, phrases: readonly string[]): boolean {
  for (const p of phrases) {
    const re = new RegExp(`(^|[^a-z0-9'])${escapeRegex(p)}([^a-z0-9']|$)`, 'i');
    if (re.test(norm)) return true;
  }
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function classify(transcript: string, deps: ClassifyDeps = {}): Promise<Intent> {
  const norm = normalize(transcript);
  if (norm.length === 0) return 'unknown';

  if (phraseHits(norm, WHATS_NEXT_PHRASES)) return 'whats_next';
  if (phraseHits(norm, PROBLEM_PHRASES)) return 'describe_problem';

  // Ambiguous. Optional Claude fallback.
  if (!deps.anthropic) return 'unknown';

  let response: unknown;
  try {
    response = await deps.anthropic.messages.create({
      model: deps.model ?? DEFAULT_MODEL,
      max_tokens: 16,
      system: CLAUDE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [{ type: 'text', text: transcript }] }],
    });
  } catch {
    return 'unknown';
  }

  const text = extractText(response).toLowerCase().trim();
  // Take the first whitespace-separated token so a chatty reply still works.
  const token = text.split(/[\s.`'"]+/).find((t) => t.length > 0) ?? '';
  return (VALID_INTENTS as readonly string[]).includes(token) ? (token as Intent) : 'unknown';
}

/** Exported for handle.ts's critical-keyword safety fallback. */
export function hitsCriticalKeyword(transcript: string): boolean {
  return phraseHits(normalize(transcript), CRITICAL_PHRASES);
}
