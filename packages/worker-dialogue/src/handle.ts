/**
 * Intent → DialogueResponse.
 *
 * - `whats_next`: pure local computation. No Claude call. Caller advances the
 *   session and renders the next step's reference.
 * - `describe_problem`: Claude call with full session context (procedure,
 *   current step, verification prompt, last 3 verdicts, transcript). JSON-only
 *   reply parsed via the same fence-strip pattern as the verifier service.
 *   Severity in {high, critical} ALWAYS forces escalate=true here, defending
 *   against Claude omitting the flag.
 * - `unknown`: polite re-prompt. No Claude call.
 *
 * Critical-keyword safety fallback: when Claude is unreachable OR returns
 * malformed output, the handler still escalates. If the transcript contains
 * any CRITICAL_PHRASES word ("gas", "fire", "smoke", ...), severity is
 * forced to 'critical' with an evacuation directive — life-safety beats
 * politeness.
 */
import { DEFAULT_MODEL, FENCE_RE, extractText, type AnthropicMessagesClient } from './anthropic.js';
import { hitsCriticalKeyword } from './classify.js';
import type { DialogueResponse, Intent, IntentSeverity, SessionContext } from './types.js';

export interface HandleDeps {
  anthropic: AnthropicMessagesClient;
  model?: string;
}

const HANDLE_SYSTEM_PROMPT =
  'You are the on-the-job problem assistant for an industrial worker performing a Lockout/Tagout (LOTO) procedure under OSHA 29 CFR 1910.147. ' +
  "You receive the worker's spoken transcript and full session context (procedure, current step, verification prompt, recent verdicts). " +
  'Respond with strict JSON only — no prose, no markdown fences. ' +
  'Format: {"guidance": "<1-3 short sentences of plain-language guidance>", "severity": "low"|"medium"|"high"|"critical", "escalate": true|false, "voice_back_warning": "<optional short urgent line read before guidance, ONLY for life-safety>"}. ' +
  'Severity rubric: ' +
  'low = process nuisance the worker can solve themselves. ' +
  'medium = needs a supervisor to look at it but not urgent. ' +
  'high = stop work until a supervisor arrives. ' +
  'critical = life-safety / evacuation / immediate stop. ALWAYS include a voice_back_warning at critical. ' +
  'If unsure, lean higher rather than lower. Always set escalate=true at high or critical.';

const SEVERITIES: readonly IntentSeverity[] = ['low', 'medium', 'high', 'critical'];

const UNKNOWN_RE_PROMPT = "Sorry, I didn't catch that. Try 'what's next' or 'describe a problem'.";

interface ClaudeJsonReply {
  guidance: unknown;
  severity: unknown;
  escalate: unknown;
  voice_back_warning?: unknown;
}

function buildUserPrompt(context: SessionContext, transcript: string): string {
  const verdicts = context.recentVerdicts.length
    ? context.recentVerdicts
        .map((v) => `  - step ${v.stepNumber} (${v.outcome}) at ${v.at}: ${v.verdictText}`)
        .join('\n')
    : '  (none yet)';
  return [
    `Procedure: ${context.procedureId}`,
    `Current step: ${context.currentStepNumber} — ${context.currentStepTitle}`,
    'Current step verification prompt:',
    context.currentStepVerificationPrompt,
    'Recent verdicts (oldest first):',
    verdicts,
    '',
    `Worker said: "${transcript}"`,
    '',
    'Reply with JSON only.',
  ].join('\n');
}

function whatsNextResponse(context: SessionContext): DialogueResponse {
  // Without an explicit nextStepTitle in SessionContext we synthesize a short
  // local reply. The caller is responsible for advancing the session and
  // rendering the next reference; this guidance is only the voice-back.
  if (context.currentStepNumber >= 10) {
    return {
      intent: 'whats_next',
      guidance: 'Procedure complete. Nothing more to do — well done.',
    };
  }
  const next = context.currentStepNumber + 1;
  return {
    intent: 'whats_next',
    guidance: `Advancing to step ${next}. Hold for the next instruction.`,
  };
}

function unknownResponse(): DialogueResponse {
  return { intent: 'unknown', guidance: UNKNOWN_RE_PROMPT };
}

function isSeverity(s: unknown): s is IntentSeverity {
  return typeof s === 'string' && (SEVERITIES as readonly string[]).includes(s);
}

function clampString(s: unknown, fallback: string): string {
  return typeof s === 'string' && s.trim().length > 0 ? s.trim() : fallback;
}

function joinVoiceBackAndGuidance(voiceBack: unknown, guidance: string): string {
  if (typeof voiceBack === 'string' && voiceBack.trim().length > 0) {
    return `${voiceBack.trim()} ${guidance}`.trim();
  }
  return guidance;
}

function safeFallback(transcript: string): DialogueResponse {
  if (hitsCriticalKeyword(transcript)) {
    return {
      intent: 'describe_problem',
      guidance:
        'Stop and evacuate the area now. Do not operate any electrical equipment. ' +
        'I could not reach the assistant — call your supervisor immediately.',
      severity: 'critical',
      escalate: true,
    };
  }
  return {
    intent: 'describe_problem',
    guidance: "I couldn't reach the assistant. Stop, hold the step, and call your supervisor.",
    severity: 'medium',
    escalate: true,
  };
}

async function handleDescribeProblem(
  transcript: string,
  context: SessionContext,
  deps: HandleDeps,
): Promise<DialogueResponse> {
  const userPrompt = buildUserPrompt(context, transcript);

  let response: unknown;
  try {
    response = await deps.anthropic.messages.create({
      model: deps.model ?? DEFAULT_MODEL,
      max_tokens: 400,
      system: HANDLE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [{ type: 'text', text: userPrompt }] }],
    });
  } catch {
    return safeFallback(transcript);
  }

  const text = extractText(response);
  if (text.length === 0) return safeFallback(transcript);

  let parsed: ClaudeJsonReply;
  try {
    parsed = JSON.parse(text.replace(FENCE_RE, '').trim()) as ClaudeJsonReply;
  } catch {
    return safeFallback(transcript);
  }

  const severity: IntentSeverity = isSeverity(parsed.severity) ? parsed.severity : 'medium';
  const baseGuidance = clampString(parsed.guidance, 'Stop and call your supervisor.');
  const guidance = joinVoiceBackAndGuidance(parsed.voice_back_warning, baseGuidance);

  // Force escalate=true at high/critical even if Claude forgot to set it.
  // Critical-keyword safety net: if the worker said something life-safety-y
  // but Claude graded it < high, upgrade to high.
  let escalate = Boolean(parsed.escalate);
  let finalSeverity = severity;
  if (severity === 'high' || severity === 'critical') escalate = true;
  if (hitsCriticalKeyword(transcript) && severity !== 'critical' && severity !== 'high') {
    finalSeverity = 'high';
    escalate = true;
  }

  return {
    intent: 'describe_problem',
    guidance,
    severity: finalSeverity,
    escalate,
  };
}

export async function handle(
  intent: Intent,
  transcript: string,
  context: SessionContext,
  deps: HandleDeps,
): Promise<DialogueResponse> {
  switch (intent) {
    case 'whats_next':
      return whatsNextResponse(context);
    case 'describe_problem':
      return handleDescribeProblem(transcript, context, deps);
    case 'unknown':
      return unknownResponse();
  }
}
