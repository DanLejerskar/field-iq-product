/** Subset of backend response shapes the dashboard cares about. */

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

export interface StepRow {
  id: string;
  stepNumber: number;
  title: string;
  instruction: string;
  referenceImageUrl?: string | null;
  verificationPrompt?: string | null;
  successCriteria?: string | null;
  retryThreshold?: number;
}

export interface SessionDetailResponse {
  session: SessionRow;
  steps: StepRow[];
  state: { currentStepNumber: number; status?: SessionStatus };
}

export type AuditEventType =
  | 'photo_submitted'
  | 'verified'
  | 'retry'
  | 'skip'
  | 'start'
  | 'complete'
  | 'abandon'
  | 'error'
  | 'override'
  | 'note';

export interface AuditRow {
  id: string;
  sessionId: string;
  stepId: string | null;
  stepNumber: number | null;
  eventType: AuditEventType;
  photoUrl: string | null;
  verified: boolean | null;
  confidence: 'high' | 'medium' | 'low' | null;
  message: string | null;
  detail: string | null;
  timestamp: string;
  supersededBy: string | null;
}

export interface EquipmentRow {
  id: string;
  orgId: string;
  name: string;
  assetTag: string;
  qrCodeValue: string;
  description?: string;
  location?: string;
}

export interface ProcedureRow {
  id: string;
  equipmentId: string;
  name: string;
  version: string;
  totalSteps: number;
  isActive: boolean;
}
