/**
 * Session + SessionEvent.
 * Source of truth: FIELD_IQ_PRODUCT_SPEC.md §4.2 (verbatim shape).
 *
 * `Session` is written by Field IQ (glasses + phone) and read by the dashboard. `events`
 * is an append-only log; the persisted audit record lives in `AuditLog` (see audit.ts).
 */
import type {
  ComponentId,
  DeviceId,
  IsoTimestamp,
  ProcedureId,
  SessionId,
  StepId,
  UserId,
} from './common.js';

export type SessionStatus = 'active' | 'completed' | 'aborted' | 'supervisor-intervened';
export type SessionMode = 'walk-through' | 'stand-by';

export interface Session {
  id: SessionId;
  workerId: UserId;
  deviceId: DeviceId;
  procedureId: ProcedureId;
  procedureVersion: string;
  startedAt: IsoTimestamp;
  completedAt?: IsoTimestamp;
  status: SessionStatus;
  mode: SessionMode;
  currentStepId?: StepId;
  events: SessionEvent[];
}

export type EventSource = 'field-iq-glasses' | 'field-iq-phone' | 'monitor' | 'ai-pipeline';

export interface BaseEvent {
  id: string;
  sessionId: SessionId;
  at: IsoTimestamp;
  source: EventSource;
}

export interface StepStartedEvent extends BaseEvent {
  kind: 'step-started';
  stepId: StepId;
  confidence: number;
}

export interface StepCompletedEvent extends BaseEvent {
  kind: 'step-completed';
  stepId: StepId;
  proofAssetUrl?: string;
  confidence: number;
  verificationMethod: 'auto-photo' | 'voice-confirm' | 'manual' | 'supervisor-override';
}

export interface InterventionEvent extends BaseEvent {
  kind: 'intervention';
  reason: 'wrong-target' | 'missed-step' | 'hazard' | 'low-confidence';
  detectedTargetComponentId?: ComponentId;
  expectedTargetComponentId?: ComponentId;
  resolvedBy: 'self-corrected' | 'supervisor' | 'session-aborted';
  latencyMs: number;
}

export interface EscalationEvent extends BaseEvent {
  kind: 'escalation';
  toRole: 'supervisor' | 'master-technician' | 'safety-officer';
  reason: string;
}

export interface RecognitionEvent extends BaseEvent {
  kind: 'recognition';
  equipmentId: string;
  confidence: number;
  detectionMethod: 'qr' | 'nfc' | 'computer-vision';
}

export type SessionEvent =
  | StepStartedEvent
  | StepCompletedEvent
  | InterventionEvent
  | EscalationEvent
  | RecognitionEvent;
