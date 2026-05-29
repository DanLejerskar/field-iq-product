/** Thin fetch wrapper around the M3 endpoints; surfaces problem+json errors as throws. */
import type { ListSessionsResponse } from './types';

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

  listSessions(status?: string): Promise<ListSessionsResponse> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<ListSessionsResponse>('GET', `/api/sessions${qs}`);
  }
}
