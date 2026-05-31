/**
 * In-memory snapshot of the demo session. Subscribers (the dashboard and the
 * glasses-webapp) re-render when the snapshot changes. The timeline is the
 * only writer; pages are read-only.
 */
import {
  MOCK_EQUIPMENT,
  MOCK_ORG,
  MOCK_PROCEDURE,
  MOCK_TRAINEE,
  MOCK_TRAINER,
  STEPS,
  type MockStep,
} from './steps.js';
import { start, type TimelineController } from './timeline.js';
import type { CardState, SessionStatus, TimelineEvent } from './types.js';

export interface AuditEntry {
  id: string;
  sessionId: string;
  stepNumber: number | null;
  stepId: string | null;
  eventType: 'photo_submitted' | 'verified' | 'retry' | 'error' | 'start' | 'complete' | 'note';
  photoUrl: string | null;
  verified: boolean | null;
  confidence: 'high' | 'medium' | 'low' | null;
  message: string | null;
  detail: string | null;
  timestamp: string;
  supersededBy: string | null;
}

export interface CoachNote {
  id: string;
  text: string;
  stepNumber?: number;
  timestamp: string;
}

export interface SessionRow {
  id: string;
  orgId: string;
  equipmentId: string;
  procedureId: string;
  procedureVersion: string;
  technicianUserId: string;
  technicianName: string;
  status: SessionStatus;
  startedAt: string;
  completedAt: string | null;
}

export interface DemoSnapshot {
  session: SessionRow;
  steps: MockStep[];
  currentStep: number;
  cardState: CardState;
  cardMessage?: string;
  verifiedSteps: Set<number>;
  audit: AuditEntry[];
  notes: CoachNote[];
  lastEventId: number;
  trainer: typeof MOCK_TRAINER;
  trainee: typeof MOCK_TRAINEE;
  equipment: typeof MOCK_EQUIPMENT;
  procedure: typeof MOCK_PROCEDURE;
  org: typeof MOCK_ORG;
}

type Listener = (snapshot: DemoSnapshot) => void;

function nowIso(): string {
  return new Date().toISOString();
}

function cardForEvent(type: TimelineEvent['type']): CardState | undefined {
  switch (type) {
    case 'step.verification_started':
      return 'processing';
    case 'step.verified':
      return 'verified';
    case 'step.retry':
      return 'retry';
    case 'step.failed':
      return 'error';
    case 'session.completed':
      return 'complete';
    default:
      return undefined;
  }
}

export class DemoStore {
  private snapshot: DemoSnapshot;
  private listeners = new Set<Listener>();
  private controller: TimelineController | undefined;

  constructor() {
    this.snapshot = this.freshSnapshot();
  }

  private freshSnapshot(): DemoSnapshot {
    const startedAt = nowIso();
    return {
      session: {
        id: 'demo-session-2026-loto-001',
        orgId: MOCK_ORG.id,
        equipmentId: MOCK_EQUIPMENT.id,
        procedureId: MOCK_PROCEDURE.id,
        procedureVersion: MOCK_PROCEDURE.version,
        technicianUserId: MOCK_TRAINEE.id,
        technicianName: MOCK_TRAINEE.fullName,
        status: 'active',
        startedAt,
        completedAt: null,
      },
      steps: STEPS,
      currentStep: 1,
      cardState: 'pending',
      verifiedSteps: new Set(),
      audit: [],
      notes: [],
      lastEventId: 0,
      trainer: MOCK_TRAINER,
      trainee: MOCK_TRAINEE,
      equipment: MOCK_EQUIPMENT,
      procedure: MOCK_PROCEDURE,
      org: MOCK_ORG,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): DemoSnapshot {
    return this.snapshot;
  }

  pause(): void {
    this.controller?.pause();
    this.emit({ ...this.snapshot, cardState: 'paused' });
  }

  resume(): void {
    this.controller?.resume();
    // After resume, the next timeline event will overwrite cardState; for now
    // restore the most likely state based on currentStep.
    this.emit({ ...this.snapshot, cardState: 'processing' });
  }

  isPaused(): boolean {
    return this.controller?.isPaused() ?? false;
  }

  addNote(text: string): CoachNote {
    const note: CoachNote = {
      id: `note-${Date.now()}`,
      text,
      stepNumber: this.snapshot.currentStep,
      timestamp: nowIso(),
    };
    this.snapshot = { ...this.snapshot, notes: [...this.snapshot.notes, note] };
    this.broadcast();
    return note;
  }

  /** Start the scripted timeline. Idempotent — calling again resets. */
  start(speed = 1): void {
    if (this.controller) this.controller.stop();
    this.snapshot = this.freshSnapshot();
    this.broadcast();
    this.controller = start({
      speed,
      onEvent: (evt) => this.consume(evt),
    });
  }

  stop(): void {
    this.controller?.stop();
    this.controller = undefined;
  }

  private consume(evt: TimelineEvent): void {
    const next: DemoSnapshot = { ...this.snapshot, lastEventId: evt.eventId };

    if (evt.type === 'session.created' && evt.stepNumber !== undefined) {
      next.currentStep = evt.stepNumber;
      next.cardState = 'pending';
      next.audit = [
        ...next.audit,
        {
          id: `audit-${evt.eventId}`,
          sessionId: evt.sessionId,
          stepNumber: null,
          stepId: null,
          eventType: 'start',
          photoUrl: null,
          verified: null,
          confidence: null,
          message: null,
          detail: 'Session opened.',
          timestamp: evt.ts,
          supersededBy: null,
        },
      ];
    }

    if (evt.type === 'session.advanced' && evt.stepNumber !== undefined) {
      next.currentStep = evt.stepNumber;
      next.cardState = 'pending';
      next.cardMessage = undefined;
    }

    if (evt.type === 'step.verification_started' && evt.stepNumber !== undefined) {
      const step = STEPS.find((s) => s.stepNumber === evt.stepNumber);
      next.cardState = 'processing';
      next.cardMessage = undefined;
      next.audit = [
        ...next.audit,
        {
          id: `audit-${evt.eventId}`,
          sessionId: evt.sessionId,
          stepNumber: evt.stepNumber,
          stepId: evt.stepId ?? null,
          eventType: 'photo_submitted',
          photoUrl: step?.photoDataUri ?? null,
          verified: null,
          confidence: null,
          message: null,
          detail: null,
          timestamp: evt.ts,
          supersededBy: null,
        },
      ];
    }

    if (evt.type === 'step.verified' && evt.stepNumber !== undefined) {
      next.cardState = 'verified';
      next.cardMessage = evt.message;
      next.verifiedSteps = new Set(this.snapshot.verifiedSteps).add(evt.stepNumber);
      const step = STEPS.find((s) => s.stepNumber === evt.stepNumber);
      next.audit = [
        ...next.audit,
        {
          id: `audit-${evt.eventId}`,
          sessionId: evt.sessionId,
          stepNumber: evt.stepNumber,
          stepId: evt.stepId ?? null,
          eventType: 'verified',
          photoUrl: step?.photoDataUri ?? null,
          verified: true,
          confidence: evt.confidence ?? 'high',
          message: evt.message ?? null,
          detail: evt.detail ?? null,
          timestamp: evt.ts,
          supersededBy: null,
        },
      ];
    }

    if (evt.type === 'step.retry' && evt.stepNumber !== undefined) {
      next.cardState = 'retry';
      next.cardMessage = evt.message;
      const step = STEPS.find((s) => s.stepNumber === evt.stepNumber);
      next.audit = [
        ...next.audit,
        {
          id: `audit-${evt.eventId}`,
          sessionId: evt.sessionId,
          stepNumber: evt.stepNumber,
          stepId: evt.stepId ?? null,
          eventType: 'retry',
          photoUrl: step?.photoDataUri ?? null,
          verified: false,
          confidence: evt.confidence ?? 'low',
          message: evt.message ?? null,
          detail: evt.detail ?? null,
          timestamp: evt.ts,
          supersededBy: null,
        },
      ];
    }

    if (evt.type === 'step.failed') {
      next.cardState = 'error';
      next.cardMessage = evt.message;
    }

    if (evt.type === 'session.completed') {
      next.cardState = 'complete';
      next.session = { ...next.session, status: 'completed', completedAt: evt.ts };
      next.audit = [
        ...next.audit,
        {
          id: `audit-${evt.eventId}`,
          sessionId: evt.sessionId,
          stepNumber: null,
          stepId: null,
          eventType: 'complete',
          photoUrl: null,
          verified: null,
          confidence: null,
          message: 'Procedure complete — 10/10 verified.',
          detail: null,
          timestamp: evt.ts,
          supersededBy: null,
        },
      ];
    }

    // Also carry the raw event through for any subscriber that wants envelope semantics.
    const cardOverride = cardForEvent(evt.type);
    if (cardOverride && next.cardState !== cardOverride) next.cardState = cardOverride;

    this.emit(next);
  }

  private emit(next: DemoSnapshot): void {
    this.snapshot = next;
    this.broadcast();
  }

  private broadcast(): void {
    for (const l of this.listeners) l(this.snapshot);
  }
}

/** Process-wide singleton — both apps' pages read from the same instance. */
let singleton: DemoStore | undefined;
export function getDemoStore(): DemoStore {
  if (!singleton) {
    singleton = new DemoStore();
    singleton.start();
  }
  return singleton;
}
