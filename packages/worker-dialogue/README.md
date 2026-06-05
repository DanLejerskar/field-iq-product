# @field-iq/worker-dialogue

Voice + text dialogue with the worker during a Field IQ session. Two firm
intents:

- **`whats_next`** — fast path. Keyword-classified locally; no Claude call;
  no DB write. Caller advances the session and re-renders the next step.
- **`describe_problem`** — Claude path. Full session context goes into the
  prompt (procedure, current step, verification prompt, recent verdicts,
  transcript); Claude returns guidance + severity (`low|medium|high|critical`)
  - an escalate flag. `high` and `critical` always escalate.
- **`unknown`** — polite re-prompt for everything else.

The package ships framework-agnostic factories plus React 18+ and Preact 10+
entry points (same multi-runtime pattern as `@field-iq/mode-config`).

## Usage

### Backend route

```ts
import Anthropic from '@anthropic-ai/sdk';
import { classify, handle } from '@field-iq/worker-dialogue';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.post('/api/dialogue', async (req) => {
  const { transcript, context } = req.body as { transcript: string; context: SessionContext };
  const intent = await classify(transcript, { anthropic });
  const response = await handle(intent, transcript, context, { anthropic });

  if (response.escalate) {
    await bus.publish(`session:${context.sessionId}`, {
      type: 'supervisor_needed',
      severity: response.severity,
      guidance: response.guidance,
      transcript,
    });
  }
  return response;
});
```

### Glasses-webapp (Preact)

```tsx
import { PushToTalk } from '@field-iq/worker-dialogue/preact';

export function HudControls({ onSpoken }: { onSpoken: (t: string) => void }) {
  return <PushToTalk onTranscript={onSpoken} />;
}
```

### Dashboard (React)

```tsx
import { PushToTalk } from '@field-iq/worker-dialogue/react';

// Trainer-side push-to-talk for one-way coaching audio (future).
<PushToTalk onTranscript={(t) => recordCoachingNote(t)} />;
```

### Dashboard alert subscriber

```tsx
// Subscribe to the org channel; render a red banner on the affected session
// card when severity is high or critical.
useEffect(() => {
  const sub = subscribeToSession(sessionId, (event) => {
    if (event.type === 'supervisor_needed') showAlert(event);
  });
  return sub.close;
}, [sessionId]);
```

## Contract tables

### DialogueResponse

| Field      | Notes                                                                        |
| ---------- | ---------------------------------------------------------------------------- |
| `intent`   | `'whats_next' \| 'describe_problem' \| 'unknown'`.                           |
| `guidance` | Plain-language line; also used as voice-back text.                           |
| `severity` | Only set on `describe_problem`. `'low' \| 'medium' \| 'high' \| 'critical'`. |
| `escalate` | Forced true at `'high'` and `'critical'`.                                    |

### SessionContext

| Field                           | Notes                                               |
| ------------------------------- | --------------------------------------------------- |
| `sessionId`                     | Field IQ session UUID.                              |
| `procedureId`                   | E.g. `'dac811-loto'`.                               |
| `currentStepNumber`             | 1-indexed; the step the worker is on.               |
| `currentStepTitle`              | E.g. `'CLOSE BALL VALVE'`.                          |
| `currentStepVerificationPrompt` | Verbatim from the procedure seed.                   |
| `recentVerdicts`                | Last N verdicts, oldest first. Empty array allowed. |

## Two-stage classifier (why)

Latency. A "what's next" gesture happens 80+ times during a 10-step
procedure; routing every one through Claude would burn the dialogue
experience. The keyword path classifies the common cases in microseconds:

1. **Normalize** transcript (lowercase, collapse whitespace).
2. **Word-boundary** match against `WHATS_NEXT_PHRASES` (15 variants) and
   `PROBLEM_PHRASES` (~25 variants, including life-safety words).
3. **Optional Claude fallback** for ambiguous transcripts only when the
   caller provides an `anthropic` client.

Anything that doesn't hit either bucket — or any Claude failure — collapses
to `unknown`.

## Critical-keyword safety fallback

When Claude is unreachable or returns malformed output for a
`describe_problem` call, the handler still escalates:

- Transcript contains a critical keyword (`gas`, `smoke`, `fire`, `sparks`,
  `shock`, `burning`, `hurt`, `pain`) → severity `critical`, escalate true,
  guidance includes "evacuate" / "do not operate".
- Otherwise → severity `medium`, escalate true, neutral
  "couldn't reach the assistant; call your supervisor" guidance.

Life-safety always beats politeness — better to bother the supervisor than
miss a real problem.

## Peer dependencies

`@anthropic-ai/sdk`, `react`, `preact` are all peer dependencies (all
optional). QR-only callers, voice-only callers, or non-DOM consumers can
take just the bits they need without pulling in the rest.

## Web Speech API note

`useVoiceInput` feature-detects both `window.SpeechRecognition` and
`window.webkitSpeechRecognition`. When neither is present (e.g. Firefox
on desktop), `start()` sets `error: 'unsupported'` and `listening` stays
false; the consumer can swap in a fallback record button. No throws.

## Acceptance criteria (this PR)

1. `pnpm --filter @field-iq/worker-dialogue build` succeeds.
2. `pnpm --filter @field-iq/worker-dialogue test` passes (63 tests).
3. `'what's next'` and 12 other variants → `whats_next` via the keyword path.
4. `'the valve is stuck'` → Claude path with severity + escalate.
5. `'it smells like gas'` → critical + escalate + evacuation guidance.
6. Off-domain speech → `unknown`; no Claude call.
7. `useVoiceInput()` factories compile + smoke-test in jsdom.
8. No files modified outside `packages/worker-dialogue/**` (plus
   `pnpm-lock.yaml`).
