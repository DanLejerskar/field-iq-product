/** Subset of the backend response shapes the dashboard cares about. */

export type SessionStatus = 'active' | 'completed' | 'abandoned' | 'failed';

export interface SessionRow {
  id: string;
  orgId: string;
  equipmentId: string;
  procedureId: string;
  procedureVersion: string;
  technicianUserId: string;
  status: SessionStatus;
  startedAt: string;
  completedAt: string | null;
}

export interface ListSessionsResponse {
  sessions: SessionRow[];
}
