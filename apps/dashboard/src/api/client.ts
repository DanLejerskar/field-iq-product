/** Thin fetch wrapper around the M3 endpoints; surfaces problem+json errors as throws. */
import type {
  AuditRow,
  EquipmentRow,
  ListSessionsResponse,
  ProcedureRow,
  SessionDetailResponse,
  StepRow,
} from './types';

export class ApiClient {
  constructor(
    readonly apiHost: string,
    private readonly tokenProvider: () => string | undefined,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.tokenProvider();
    const res = await fetch(`${this.apiHost}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const problem = (await res.json().catch(() => ({}))) as { title?: string };
      throw new Error(problem.title ?? res.statusText);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // --- sessions ---
  listSessions(status?: string): Promise<ListSessionsResponse> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<ListSessionsResponse>('GET', `/api/sessions${qs}`);
  }
  getSession(id: string): Promise<SessionDetailResponse> {
    return this.request<SessionDetailResponse>('GET', `/api/sessions/${id}`);
  }
  getSessionAudit(id: string): Promise<{ auditLog: AuditRow[] }> {
    return this.request<{ auditLog: AuditRow[] }>('GET', `/api/sessions/${id}/audit`);
  }
  postNote(id: string, text: string, stepNumber?: number): Promise<{ auditId: string }> {
    return this.request<{ auditId: string }>('POST', `/api/sessions/${id}/notes`, {
      text,
      stepNumber,
    });
  }

  // --- admin ---
  listEquipment(): Promise<EquipmentRow[]> {
    return this.request<EquipmentRow[]>('GET', '/api/admin/equipment');
  }
  createEquipment(body: Partial<EquipmentRow>): Promise<EquipmentRow> {
    return this.request<EquipmentRow>('POST', '/api/admin/equipment', body);
  }
  createProcedure(body: Partial<ProcedureRow>): Promise<ProcedureRow> {
    return this.request<ProcedureRow>('POST', '/api/admin/procedures', body);
  }
  updateStep(id: string, body: Partial<StepRow>): Promise<StepRow> {
    return this.request<StepRow>('PUT', `/api/admin/steps/${id}`, body);
  }
  testPrompt(
    stepId: string,
    body: { prompt: string; photoBase64?: string },
  ): Promise<{
    stepId: string;
    mode: 'mock' | 'live';
    result: { verified: boolean; confidence: string; message: string; detail: string };
  }> {
    return this.request('POST', `/api/admin/steps/${stepId}/test-prompt`, body);
  }
}
