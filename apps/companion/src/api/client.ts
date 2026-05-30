/**
 * REST client. Thin wrapper around fetch that injects the bearer token and
 * surfaces backend's RFC 7807 problem+json errors as throws.
 */
export interface ApiError extends Error {
  status: number;
  code?: string;
}

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
      const problem = (await res.json().catch(() => ({}))) as {
        title?: string;
        code?: string;
      };
      const err = new Error(problem.title ?? res.statusText) as ApiError;
      err.status = res.status;
      err.code = problem.code;
      throw err;
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // --- auth ---
  requestMagicLink(email: string): Promise<void> {
    return this.request<void>('POST', '/api/auth/magic-link/request', { email });
  }
  verifyMagicLink(token: string): Promise<{
    jwt: string;
    user: { id: string; email: string; fullName: string; role: string };
    org: { id: string };
  }> {
    return this.request('POST', '/api/auth/magic-link/verify', { token });
  }

  // --- content ---
  resolveQr(qrValue: string): Promise<{
    equipment: { id: string; name: string };
    activeProcedure: { id: string; name: string; version: string } | null;
  }> {
    return this.request('POST', '/api/equipment/resolve', { qrValue });
  }

  // --- sessions ---
  createSession(
    equipmentId: string,
    procedureId: string,
  ): Promise<{ sessionId: string; firstStepId: string }> {
    return this.request('POST', '/api/sessions', { equipmentId, procedureId });
  }

  getSession(id: string): Promise<{
    session: { id: string; status: string };
    steps: Array<{
      stepNumber: number;
      title: string;
      instruction: string;
      referenceImageUrl?: string;
    }>;
    state: { currentStepNumber: number };
  }> {
    return this.request('GET', `/api/sessions/${id}`);
  }

  verifyPhoto(
    sessionId: string,
    body: { stepNumber: number; photoBase64: string; lat?: number; lng?: number },
  ): Promise<{ auditId: string; queuedForVerification: true }> {
    return this.request('POST', `/api/sessions/${sessionId}/verify`, body);
  }

  advance(sessionId: string): Promise<{ currentStepNumber: number }> {
    return this.request('POST', `/api/sessions/${sessionId}/advance`);
  }

  complete(sessionId: string): Promise<{ ok: true }> {
    return this.request('POST', `/api/sessions/${sessionId}/complete`);
  }

  abandon(sessionId: string, reason: string): Promise<{ ok: true }> {
    return this.request('POST', `/api/sessions/${sessionId}/abandon`, { reason });
  }
}
