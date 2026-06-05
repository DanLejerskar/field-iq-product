/**
 * Claude Vision recognition path.
 *
 * Mirrors the existing Python verifier's call shape (services/verifier/src/
 * verifier/verifier.py): system prompt + a single user message with one
 * image content block + one text block. Claude returns strict JSON which we
 * strip-fence + parse + clamp.
 *
 * Failure-safe: any parse error, schema mismatch, off-catalog equipmentId,
 * or SDK exception resolves to a `confidence: 0` Recognition rather than
 * throwing. The orchestrator falls back to QR on low confidence.
 */
import type { KnownEquipment, Recognition } from './types.js';

/** Structural type covering both Anthropic SDK clients and test stubs. */
export interface AnthropicMessagesClient {
  messages: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
}

export interface VisionDeps {
  anthropic: AnthropicMessagesClient;
  /** Default 'claude-sonnet-4-6'. */
  model?: string;
  catalog: readonly KnownEquipment[];
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT =
  'You are an industrial equipment recognizer for the EON Field IQ platform. ' +
  'You receive one photo and a list of known equipment with descriptions and ' +
  'visual markers. Reply with strict JSON only. No prose around it. No ' +
  'markdown fences. Format: ' +
  '{"equipmentId": "<id from the list>" or null, "confidence": 0..1, "reasoning": "<one short sentence>"}.';

const FENCE_RE = /^```(?:json)?\s*\n?|\n?```\s*$/gm;

interface DataUri {
  mediaType: string;
  base64: string;
}

export function parseDataUri(dataUri: string): DataUri | null {
  // data:[<mediatype>][;base64],<data>
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(dataUri);
  if (!match) return null;
  const mediaType = match[1] && match[1].length > 0 ? match[1] : 'image/jpeg';
  const base64 = match[2] ?? '';
  if (base64.length === 0) return null;
  return { mediaType, base64 };
}

export function buildUserPrompt(catalog: readonly KnownEquipment[]): string {
  const lines: string[] = [];
  lines.push('Known equipment catalog:');
  catalog.forEach((e, idx) => {
    lines.push('');
    lines.push(`(${idx + 1}) equipmentId: ${e.equipmentId}`);
    lines.push(`    description: ${e.description}`);
    lines.push('    visual markers:');
    for (const m of e.visualMarkers) lines.push(`      - ${m}`);
  });
  lines.push('');
  lines.push(
    'Which equipmentId from the list above matches the photo? If the photo does not match any entry, return equipmentId: null.',
  );
  lines.push('Respond with JSON only.');
  return lines.join('\n');
}

interface ClaudeResponse {
  equipmentId: unknown;
  confidence: unknown;
  reasoning: unknown;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as { type?: unknown; text?: unknown };
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text);
  }
  return parts.join('');
}

function fail(detail: string): Recognition {
  return { equipmentId: null, source: 'vision', confidence: 0, detail };
}

export async function recognizeFromPhoto(
  photoDataUri: string,
  deps: VisionDeps,
): Promise<Recognition> {
  const parsed = parseDataUri(photoDataUri);
  if (!parsed) return fail('photo is not a valid data URI');

  const userPrompt = buildUserPrompt(deps.catalog);
  const model = deps.model ?? DEFAULT_MODEL;

  let response: unknown;
  try {
    response = await deps.anthropic.messages.create({
      model,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: parsed.mediaType, data: parsed.base64 },
            },
            { type: 'text', text: userPrompt },
          ],
        },
      ],
    });
  } catch (err) {
    return fail(`claude call failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const text = extractText((response as { content?: unknown }).content);
  if (text.length === 0) return fail('claude returned no text content');

  let parsedJson: ClaudeResponse;
  try {
    parsedJson = JSON.parse(text.replace(FENCE_RE, '').trim()) as ClaudeResponse;
  } catch (err) {
    return fail(`unparseable claude response: ${err instanceof Error ? err.message : String(err)}`);
  }

  const confidence = clamp01(Number(parsedJson.confidence));
  const reasoning = typeof parsedJson.reasoning === 'string' ? parsedJson.reasoning : undefined;
  const rawId = parsedJson.equipmentId;

  if (rawId === null) {
    return { equipmentId: null, source: 'vision', confidence, detail: reasoning };
  }
  if (typeof rawId !== 'string' || rawId.length === 0) {
    return fail(`claude response had invalid equipmentId: ${JSON.stringify(rawId)}`);
  }
  const known = deps.catalog.find((e) => e.equipmentId === rawId);
  if (!known) {
    return {
      equipmentId: null,
      source: 'vision',
      confidence: 0,
      detail: `claude returned equipmentId '${rawId}' not in catalog`,
    };
  }
  return { equipmentId: rawId, source: 'vision', confidence, detail: reasoning };
}
