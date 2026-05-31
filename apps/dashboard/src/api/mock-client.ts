/**
 * Mock ApiClient — same surface as ./client.ts ApiClient, but every read /
 * write maps to the in-memory `DemoStore` from @field-iq/mock-demo. Used when
 * VITE_MOCK_MODE === 'true' so the dashboard runs as a standalone Vercel build
 * with no backend.
 *
 * Mutations (postNote, createEquipment, …) update the store snapshot so the
 * Live Sessions / Session Detail / Admin pages stay reactive via useMockSync.
 */
import {
  getDemoStore,
  MOCK_EQUIPMENT,
  MOCK_PROCEDURE,
  STEPS,
  type DemoSnapshot,
} from '@field-iq/mock-demo';
import type {
  AuditRow,
  EquipmentRow,
  ListSessionsResponse,
  ProcedureRow,
  SessionDetailResponse,
  SessionStatus,
  StepRow,
} from './types';

function snapshot(): DemoSnapshot {
  return getDemoStore().getSnapshot();
}

function sessionRow(snap: DemoSnapshot) {
  return {
    id: snap.session.id,
    orgId: snap.session.orgId,
    equipmentId: snap.session.equipmentId,
    procedureId: snap.session.procedureId,
    procedureVersion: snap.session.procedureVersion,
    technicianUserId: snap.session.technicianUserId,
    status: snap.session.status as SessionStatus,
    startedAt: snap.session.startedAt,
    completedAt: snap.session.completedAt,
  };
}

function stepRows(): StepRow[] {
  return STEPS.map((s) => ({
    id: `step-${s.stepNumber}`,
    stepNumber: s.stepNumber,
    title: s.title,
    instruction: s.instruction,
    referenceImageUrl: s.photoDataUri,
    verificationPrompt: s.verificationPrompt,
    successCriteria: s.verdictMessage,
    retryThreshold: 3,
  }));
}

function auditRows(snap: DemoSnapshot): AuditRow[] {
  return snap.audit.map((a) => ({
    id: a.id,
    sessionId: a.sessionId,
    stepId: a.stepId,
    stepNumber: a.stepNumber,
    eventType: a.eventType,
    photoUrl: a.photoUrl,
    verified: a.verified,
    confidence: a.confidence,
    message: a.message,
    detail: a.detail,
    timestamp: a.timestamp,
    supersededBy: a.supersededBy,
  }));
}

const noteRows = (snap: DemoSnapshot): AuditRow[] =>
  snap.notes.map((n) => ({
    id: n.id,
    sessionId: snap.session.id,
    stepId: null,
    stepNumber: n.stepNumber ?? null,
    eventType: 'note',
    photoUrl: null,
    verified: null,
    confidence: null,
    message: null,
    detail: n.text,
    timestamp: n.timestamp,
    supersededBy: null,
  }));

export class MockApiClient {
  readonly apiHost = 'mock://demo';

  async listSessions(status?: string): Promise<ListSessionsResponse> {
    const row = sessionRow(snapshot());
    if (status && row.status !== status) return { sessions: [] };
    return { sessions: [row] };
  }

  async getSession(_id: string): Promise<SessionDetailResponse> {
    const snap = snapshot();
    return {
      session: sessionRow(snap),
      steps: stepRows(),
      state: { currentStepNumber: snap.currentStep, status: snap.session.status as SessionStatus },
    };
  }

  async getSessionAudit(_id: string): Promise<{ auditLog: AuditRow[] }> {
    const snap = snapshot();
    const combined = [...auditRows(snap), ...noteRows(snap)].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
    return { auditLog: combined };
  }

  async postNote(_id: string, text: string, _stepNumber?: number): Promise<{ auditId: string }> {
    const note = getDemoStore().addNote(text);
    return { auditId: note.id };
  }

  private equipmentRows: EquipmentRow[] = [
    {
      id: MOCK_EQUIPMENT.id,
      orgId: 'org_eon_demo',
      name: MOCK_EQUIPMENT.name,
      assetTag: MOCK_EQUIPMENT.assetTag,
      qrCodeValue: MOCK_EQUIPMENT.qrCodeValue,
      description: 'DAC Worldwide #811 trainer — used for hands-on LOTO certification.',
      location: 'EON Training Bay 1',
    },
  ];
  private procedureRows: ProcedureRow[] = [
    {
      id: MOCK_PROCEDURE.id,
      equipmentId: MOCK_EQUIPMENT.id,
      name: MOCK_PROCEDURE.name,
      version: MOCK_PROCEDURE.version,
      totalSteps: STEPS.length,
      isActive: true,
    },
  ];

  async listEquipment(): Promise<EquipmentRow[]> {
    return this.equipmentRows;
  }
  async createEquipment(body: Partial<EquipmentRow>): Promise<EquipmentRow> {
    const row: EquipmentRow = {
      id: `eq-${Date.now()}`,
      orgId: 'org_eon_demo',
      name: body.name ?? 'Untitled',
      assetTag: body.assetTag ?? '',
      qrCodeValue: body.qrCodeValue ?? '',
      description: body.description,
      location: body.location,
    };
    this.equipmentRows = [...this.equipmentRows, row];
    return row;
  }
  async createProcedure(body: Partial<ProcedureRow>): Promise<ProcedureRow> {
    const row: ProcedureRow = {
      id: `proc-${Date.now()}`,
      equipmentId: body.equipmentId ?? MOCK_EQUIPMENT.id,
      name: body.name ?? 'Untitled procedure',
      version: body.version ?? '0.1.0',
      totalSteps: 0,
      isActive: true,
    };
    this.procedureRows = [...this.procedureRows, row];
    return row;
  }
  async updateStep(_id: string, body: Partial<StepRow>): Promise<StepRow> {
    return {
      id: _id,
      stepNumber: body.stepNumber ?? 1,
      title: body.title ?? 'STEP',
      instruction: body.instruction ?? '',
      referenceImageUrl: body.referenceImageUrl ?? null,
      verificationPrompt: body.verificationPrompt ?? null,
      successCriteria: body.successCriteria ?? null,
      retryThreshold: body.retryThreshold ?? 3,
    };
  }
  async testPrompt(
    stepId: string,
    body: { prompt: string; photoBase64?: string },
  ): Promise<{
    stepId: string;
    mode: 'mock';
    result: { verified: boolean; confidence: 'high'; message: string; detail: string };
  }> {
    return {
      stepId,
      mode: 'mock',
      result: {
        verified: true,
        confidence: 'high',
        message: 'Sandbox verdict (mock).',
        detail: `Mock pass for a prompt of length ${body.prompt.length}. Live verdicts require services/verifier + ANTHROPIC_API_KEY.`,
      },
    };
  }
}
