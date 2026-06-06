/**
 * Audit-log row → ReplayEvent projection.
 *
 * The dashboard's "session replay" page consumes a normalized stream of
 * typed events with discriminated payloads — easier to render than raw
 * audit_log rows. This module is pure, no I/O; the route just stitches it
 * to a SELECT.
 *
 * Schema reality vs. the spec:
 *   - The DB enum is the 10-value set declared in db/schema.ts (no
 *     `worker_dialogue` or `safety_alert` rows). We project from what
 *     actually exists today:
 *       audit:photo_submitted   → step.photo_captured
 *       audit:verified          → step.verified  (verdict: pass)
 *       audit:error             → step.verified  (verdict: fail)
 *       audit:retry             → step.retry
 *       audit:start             → session.started
 *       audit:complete | abandon→ session.ended
 *       audit:note              → worker_dialogue (transcript in `detail`)
 *       audit:override          → safety_alert when claudeResponse.kind ===
 *                                 'safety_alert', else omitted
 *       audit:skip              → omitted
 *   - When the backend later persists structured dialogue / safety_alert
 *     rows we can route on a new audit_event_type without changing
 *     anything else.
 */

export type ReplayEventType =
  | 'session.started'
  | 'step.started'
  | 'step.photo_captured'
  | 'step.verified'
  | 'step.retry'
  | 'worker_dialogue'
  | 'safety_alert'
  | 'session.ended';

export type ReplaySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ReplayEventBase {
  id: string;
  type: ReplayEventType;
  stepNumber: number | null;
  timestamp: string;
}

export type ReplayEvent =
  | (ReplayEventBase & { type: 'session.started'; payload: Record<string, never> })
  | (ReplayEventBase & { type: 'step.started'; payload: Record<string, never> })
  | (ReplayEventBase & {
      type: 'step.photo_captured';
      payload: { photoUrl: string; capturedAt: string };
    })
  | (ReplayEventBase & {
      type: 'step.verified';
      payload: {
        verdict: 'pass' | 'fail' | 'inconclusive';
        confidence: number;
        verdictText: string;
      };
    })
  | (ReplayEventBase & {
      type: 'step.retry';
      payload: { reason: string; previousVerdictText: string };
    })
  | (ReplayEventBase & {
      type: 'worker_dialogue';
      payload: {
        transcript: string;
        intent: 'whats_next' | 'describe_problem';
        severity: ReplaySeverity | null;
        aiResponse: string | null;
      };
    })
  | (ReplayEventBase & {
      type: 'safety_alert';
      payload: {
        severity: ReplaySeverity;
        summary: string;
        recommendedAction: string;
        detectedBy: 'ai' | 'keyword';
      };
    })
  | (ReplayEventBase & { type: 'session.ended'; payload: Record<string, never> });

/** Shape of an audit_log row as it comes off Drizzle's `select()`. */
export interface AuditRow {
  id: string;
  sessionId: string;
  stepId: string | null;
  stepNumber: number | null;
  eventType: string;
  photoUrl: string | null;
  verified: boolean | null;
  confidence: string | null;
  message: string | null;
  detail: string | null;
  claudeResponse: unknown;
  timestamp: Date | string;
  supersededBy: string | null;
}

function toIso(ts: Date | string): string {
  return typeof ts === 'string' ? ts : ts.toISOString();
}

function confidenceToNumber(label: string | null): number {
  switch (label) {
    case 'high':
      return 0.9;
    case 'medium':
      return 0.7;
    case 'low':
      return 0.4;
    default:
      return 0;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickString(obj: Record<string, unknown> | null, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

const SEVERITIES = new Set<ReplaySeverity>(['low', 'medium', 'high', 'critical']);

function pickSeverity(obj: Record<string, unknown> | null): ReplaySeverity | null {
  const v = pickString(obj, 'severity');
  return v && SEVERITIES.has(v as ReplaySeverity) ? (v as ReplaySeverity) : null;
}

/**
 * Project one audit_log row into a ReplayEvent, or null if the row is
 * un-projectable (unknown event_type, missing required fields, superseded).
 */
export function mapAuditRowToReplayEvent(row: AuditRow): ReplayEvent | null {
  if (row.supersededBy) return null;

  const base: ReplayEventBase = {
    id: row.id,
    type: 'session.started', // placeholder, overwritten below
    stepNumber: row.stepNumber,
    timestamp: toIso(row.timestamp),
  };

  switch (row.eventType) {
    case 'start':
      return { ...base, type: 'session.started', payload: {} as Record<string, never> };

    case 'photo_submitted': {
      const photoUrl = row.photoUrl ?? '';
      if (!photoUrl) return null;
      return {
        ...base,
        type: 'step.photo_captured',
        payload: { photoUrl, capturedAt: base.timestamp },
      };
    }

    case 'verified':
      return {
        ...base,
        type: 'step.verified',
        payload: {
          verdict: 'pass',
          confidence: confidenceToNumber(row.confidence),
          verdictText: (row.message ?? row.detail ?? '').trim(),
        },
      };

    case 'error':
      return {
        ...base,
        type: 'step.verified',
        payload: {
          verdict: 'fail',
          confidence: confidenceToNumber(row.confidence),
          verdictText: (row.message ?? row.detail ?? '').trim(),
        },
      };

    case 'retry':
      return {
        ...base,
        type: 'step.retry',
        payload: {
          reason: (row.message ?? '').trim(),
          previousVerdictText: (row.detail ?? '').trim(),
        },
      };

    case 'note': {
      // worker-dialogue rides on 'note'. Structured payload (intent /
      // severity / aiResponse) ships in claudeResponse when available;
      // otherwise we still surface the transcript so the supervisor can
      // read what the worker said.
      const transcript = (row.detail ?? row.message ?? '').trim();
      if (!transcript) return null;
      const claude = asObject(row.claudeResponse);
      const intentRaw = pickString(claude, 'intent');
      const intent: 'whats_next' | 'describe_problem' =
        intentRaw === 'whats_next' ? 'whats_next' : 'describe_problem';
      return {
        ...base,
        type: 'worker_dialogue',
        payload: {
          transcript,
          intent,
          severity: pickSeverity(claude),
          aiResponse: pickString(claude, 'guidance') ?? pickString(claude, 'aiResponse'),
        },
      };
    }

    case 'override': {
      // We re-use the override event for safety_alert persistence (Phase 3
      // backend work). The discriminator lives in claudeResponse.kind.
      const claude = asObject(row.claudeResponse);
      if (pickString(claude, 'kind') !== 'safety_alert') return null;
      const severity = pickSeverity(claude);
      const summary = pickString(claude, 'summary') ?? row.message ?? '';
      const recommendedAction = pickString(claude, 'recommendedAction') ?? row.detail ?? '';
      const detectedByRaw = pickString(claude, 'detectedBy');
      const detectedBy: 'ai' | 'keyword' = detectedByRaw === 'keyword' ? 'keyword' : 'ai';
      if (!severity || !summary.trim() || !recommendedAction.trim()) return null;
      return {
        ...base,
        type: 'safety_alert',
        payload: {
          severity,
          summary: summary.trim(),
          recommendedAction: recommendedAction.trim(),
          detectedBy,
        },
      };
    }

    case 'complete':
    case 'abandon':
      return { ...base, type: 'session.ended', payload: {} as Record<string, never> };

    // skip, and anything we don't recognise, is omitted rather than
    // surfaced as raw text — the timeline only renders typed events.
    default:
      return null;
  }
}
