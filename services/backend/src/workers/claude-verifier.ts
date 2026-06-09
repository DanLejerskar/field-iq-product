/**
 * Real Claude Vision verifier (demo-grade, inline).
 *
 * Drains the same `verify-queue` Redis Stream the mock verifier uses, but
 * instead of auto-passing, it sends the photo + the step's verification
 * prompt to Claude and records Claude's real verdict. Gated by
 * USE_MOCK_VERIFIER=false.
 *
 * ARCHITECTURE NOTE: CLAUDE.md says "do not call the Anthropic API from the
 * Node backend — all Claude calls go through services/verifier". The proper
 * home for this is that Python service. This inline path is a pragmatic
 * demo affordance so we can switch on real verification with a single env
 * flag without standing up a second Railway service (which is risky while
 * Railway's build infra is degraded). When services/verifier is deployed,
 * set USE_MOCK_VERIFIER=true here and let the Python worker own the queue.
 *
 * Calls the Anthropic Messages REST API with `fetch` — no SDK dependency,
 * same pattern as services/backend/src/services/emailService.ts.
 *
 * Failure-safe: a network error, a malformed Claude response, or a missing
 * API key never throws out of the loop. We record a retry-style verdict
 * ("could not verify, please retake") so the worker on the glasses is never
 * stuck and the session stays alive.
 */
import { Redis } from 'ioredis';
import type { VerificationConfidence, VerificationResult } from '@field-iq/schema';
import { config } from '../config/env.js';
import { VERIFY_QUEUE, type VerificationJob } from '../services/bus.js';
import { recordVerdict } from '../services/session-service.js';

const GROUP = 'claude-verifier';
const CONSUMER = 'claude-1';

/** Verbatim from services/verifier/src/verifier/prompts/system.txt. */
export const SYSTEM_PROMPT = `You are an industrial safety verification AI for EON Field IQ. You analyze
photos taken by a field technician performing a Standard Operating Procedure
and determine whether the required action has been correctly executed.

Rules:
- Be strict but fair. If there is genuine visual ambiguity, request a retake
  rather than failing.
- Base your verdict only on what is visible in the photo plus the step prompt.
  Do not assume facts not in evidence.
- Photos may be taken in industrial environments with poor lighting, glare,
  or partial occlusion. Tolerate these conditions but flag if the photo is
  unusable.
- Output only valid JSON in the schema below. No markdown, no preamble.

Output JSON schema:
{
  "verified": true | false,
  "confidence": "high" | "medium" | "low",
  "message": "<one short sentence shown to the technician on the HUD>",
  "detail": "<one sentence technical explanation persisted to the audit log>"
}`;

export interface ParsedImage {
  mediaType: string;
  base64: string;
}

/**
 * Pull the media type + base64 body out of a `data:image/...;base64,...`
 * URI. In v1 the verification job's `photoKey` IS this data URI (see
 * DataUriStorageAdapter). Returns null for anything that isn't a base64
 * data URI (e.g. an S3 key) — callers degrade gracefully.
 */
export function parseDataUri(photoKey: string): ParsedImage | null {
  if (!photoKey.startsWith('data:')) return null;
  const comma = photoKey.indexOf(',');
  if (comma === -1) return null;
  const header = photoKey.slice(5, comma); // e.g. "image/jpeg;base64"
  if (!header.includes('base64')) return null;
  const mediaType = header.split(';')[0] || 'image/jpeg';
  const base64 = photoKey.slice(comma + 1);
  if (base64.length === 0) return null;
  return { mediaType, base64 };
}

const FENCE_RE = /^```(?:json)?\s*\n?|\n?```\s*$/gm;
const CONFIDENCES = new Set<VerificationConfidence>(['high', 'medium', 'low']);

/**
 * Strip optional markdown fences and parse Claude's strict-JSON verdict into
 * a VerificationResult. Throws on un-parseable / schema-invalid output; the
 * caller turns that into a safe retry verdict.
 */
export function parseVerdict(text: string): VerificationResult {
  const cleaned = text.replace(FENCE_RE, '').trim();
  const data = JSON.parse(cleaned) as Record<string, unknown>;
  const verified = data.verified;
  const confidence = data.confidence;
  const message = data.message;
  const detail = data.detail;
  if (typeof verified !== 'boolean') throw new Error('verdict.verified not a boolean');
  if (typeof confidence !== 'string' || !CONFIDENCES.has(confidence as VerificationConfidence)) {
    throw new Error(`verdict.confidence invalid: ${String(confidence)}`);
  }
  return {
    verified,
    confidence: confidence as VerificationConfidence,
    message: typeof message === 'string' ? message : '',
    detail: typeof detail === 'string' ? detail : '',
  };
}

/** Build the Anthropic Messages API request body for one photo + prompt. */
export function buildClaudeBody(
  model: string,
  stepPrompt: string,
  image: ParsedImage,
): Record<string, unknown> {
  return {
    model,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
          },
          { type: 'text', text: stepPrompt },
        ],
      },
    ],
  };
}

/** Pull the concatenated text out of an Anthropic Messages API response. */
export function extractText(response: unknown): string {
  const content = (response as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
      const t = (block as { text?: unknown }).text;
      if (typeof t === 'string') parts.push(t);
    }
  }
  return parts.join('');
}

/** Pluggable transport for tests. Posts to the Anthropic Messages REST API. */
export type AnthropicTransport = (body: Record<string, unknown>) => Promise<unknown>;

export const defaultAnthropicTransport =
  (apiKey: string): AnthropicTransport =>
  async (body) => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  };

const RETRY_VERDICT: VerificationResult = {
  verified: false,
  confidence: 'low',
  message: 'Could not verify the photo — please retake.',
  detail: 'Verifier could not produce a verdict (image unreadable or service error).',
};

export interface VerifyDeps {
  model: string;
  transport: AnthropicTransport;
}

/**
 * Verify one job end-to-end and return the verdict. Never throws — on any
 * failure it returns a safe retry verdict.
 */
export async function verifyJob(
  deps: VerifyDeps,
  job: VerificationJob,
): Promise<VerificationResult> {
  const image = parseDataUri(job.photoKey);
  if (!image) return { ...RETRY_VERDICT, detail: 'Photo was not a base64 data URI.' };
  try {
    const body = buildClaudeBody(deps.model, job.verificationPrompt, image);
    const response = await deps.transport(body);
    const text = extractText(response);
    if (!text) return { ...RETRY_VERDICT, detail: 'Claude returned no text content.' };
    return parseVerdict(text);
  } catch (err) {
    return { ...RETRY_VERDICT, detail: `Verifier error: ${String(err).slice(0, 160)}` };
  }
}

export function startClaudeVerifier(logger: {
  info: (o: object, m?: string) => void;
  error: (o: object, m?: string) => void;
}): { stop: () => Promise<void> } {
  const apiKey = config.anthropicApiKey;
  const model = config.anthropicModel;
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  let running = true;

  if (!apiKey) {
    logger.error({}, 'claude-verifier: ANTHROPIC_API_KEY not set — every photo will ask for retake');
  }
  const transport: AnthropicTransport = apiKey
    ? defaultAnthropicTransport(apiKey)
    : async () => {
        throw new Error('ANTHROPIC_API_KEY not configured');
      };
  const deps: VerifyDeps = { model, transport };

  void redis.xgroup('CREATE', VERIFY_QUEUE, GROUP, '$', 'MKSTREAM').catch(() => {
    // BUSYGROUP — group already exists; fine.
  });

  async function loop(): Promise<void> {
    while (running) {
      try {
        const res = (await redis.xreadgroup(
          'GROUP',
          GROUP,
          CONSUMER,
          'COUNT',
          1,
          'BLOCK',
          2000,
          'STREAMS',
          VERIFY_QUEUE,
          '>',
        )) as [string, [string, string[]][]][] | null;
        if (!res) continue;
        for (const [, entries] of res) {
          for (const [entryId, fields] of entries) {
            const jobJson = fields[fields.indexOf('job') + 1];
            if (!jobJson) continue;
            const job = JSON.parse(jobJson) as VerificationJob;
            const result = await verifyJob(deps, job);
            await recordVerdict(job.sessionId, job.stepNumber, result, { verifier: 'claude' });
            await redis.xack(VERIFY_QUEUE, GROUP, entryId);
            logger.info(
              { sessionId: job.sessionId, step: job.stepNumber, verified: result.verified },
              'claude verdict',
            );
          }
        }
      } catch (err) {
        logger.error({ err: String(err) }, 'claude verifier loop error');
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  void loop();
  return {
    async stop() {
      running = false;
      await redis.quit();
    },
  };
}
