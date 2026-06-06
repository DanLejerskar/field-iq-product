/**
 * Replay API types + client.
 *
 * Mirrors services/backend/src/services/replayMapper.ts's exports; the two
 * are pinned in sync by the dashboard's `useReplay` query + the backend
 * mapper's tests. We don't import the backend types directly — keeps the
 * dashboard build independent of services/backend.
 */
import { AUTH_JWT_KEY } from '../auth/auth';
import { apiHost } from './index';

export type ReplaySeverity = 'low' | 'medium' | 'high' | 'critical';

export type ReplayEventType =
  | 'session.started'
  | 'step.started'
  | 'step.photo_captured'
  | 'step.verified'
  | 'step.retry'
  | 'worker_dialogue'
  | 'safety_alert'
  | 'session.ended';

interface ReplayBase {
  id: string;
  stepNumber: number | null;
  timestamp: string;
}

export type ReplayEvent =
  | (ReplayBase & { type: 'session.started'; payload: Record<string, never> })
  | (ReplayBase & { type: 'step.started'; payload: Record<string, never> })
  | (ReplayBase & {
      type: 'step.photo_captured';
      payload: { photoUrl: string; capturedAt: string };
    })
  | (ReplayBase & {
      type: 'step.verified';
      payload: {
        verdict: 'pass' | 'fail' | 'inconclusive';
        confidence: number;
        verdictText: string;
      };
    })
  | (ReplayBase & {
      type: 'step.retry';
      payload: { reason: string; previousVerdictText: string };
    })
  | (ReplayBase & {
      type: 'worker_dialogue';
      payload: {
        transcript: string;
        intent: 'whats_next' | 'describe_problem';
        severity: ReplaySeverity | null;
        aiResponse: string | null;
      };
    })
  | (ReplayBase & {
      type: 'safety_alert';
      payload: {
        severity: ReplaySeverity;
        summary: string;
        recommendedAction: string;
        detectedBy: 'ai' | 'keyword';
      };
    })
  | (ReplayBase & { type: 'session.ended'; payload: Record<string, never> });

export interface ReplaySession {
  id: string;
  workerId: string;
  workerName: string;
  procedureId: string;
  procedureTitle: string;
  startedAt: string;
  endedAt: string | null;
  status: 'active' | 'completed' | 'aborted';
  finalOutcome: 'pass' | 'fail' | 'incomplete' | null;
}

export interface ReplayResponse {
  session: ReplaySession;
  events: ReplayEvent[];
}

export async function fetchReplay(sessionId: string): Promise<ReplayResponse> {
  const token = localStorage.getItem(AUTH_JWT_KEY) ?? '';
  const res = await fetch(`${apiHost}/api/sessions/${sessionId}/replay`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Replay fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ReplayResponse;
}
