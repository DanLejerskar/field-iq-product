/**
 * Worker-dialogue contract.
 *
 * Two firm intents:
 *   - whats_next: advance / re-show current step. Local-only, no Claude call.
 *   - describe_problem: worker speaks a problem, Claude responds with
 *     guidance, severity, and (often) an escalate flag.
 * Plus the catch-all `unknown` for everything else.
 *
 * Severity is graded; `high` and `critical` ALWAYS force `escalate=true` so
 * the dashboard alert fires even if Claude forgets to set the flag.
 */
export type Intent = 'whats_next' | 'describe_problem' | 'unknown';

export type IntentSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface DialogueResponse {
  intent: Intent;
  /** Plain-language guidance to the worker (also used as voice-back text). */
  guidance: string;
  /** Optional — only set when intent === 'describe_problem'. */
  severity?: IntentSeverity;
  /** Set true when supervisor should be alerted. Always true on severity 'high' | 'critical'. */
  escalate?: boolean;
}

export interface SessionContext {
  sessionId: string;
  procedureId: string;
  currentStepNumber: number;
  currentStepTitle: string;
  currentStepVerificationPrompt: string;
  /** Last N verdicts for the session, oldest first. Empty array allowed. */
  recentVerdicts: ReadonlyArray<{
    stepNumber: number;
    outcome: 'verified' | 'retry' | 'failed' | 'pending';
    verdictText: string;
    at: string; // ISO timestamp
  }>;
}
