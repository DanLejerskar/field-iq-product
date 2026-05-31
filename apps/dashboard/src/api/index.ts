/**
 * Single shared API client. In demo mode (VITE_MOCK_MODE === 'true', which is
 * the production default for the Vercel build) we return a MockApiClient backed
 * by the in-memory @field-iq/mock-demo store; otherwise we wire the real
 * fetch-based ApiClient against the M3 backend.
 */
import { MOCK_MODE } from '../mockMode';
import { ApiClient } from './client';
import { MockApiClient } from './mock-client';

export { MOCK_MODE };

/**
 * Hosts for the real backend, resolved in priority order:
 *   1. VITE_API_URL / VITE_WS_URL  — Phase 2B canonical names (Railway URLs).
 *   2. VITE_API_HOST / VITE_WS_HOST — Phase 1/2A legacy names (kept working).
 *   3. localhost defaults for `pnpm dev` against the local backend.
 *
 * When VITE_API_URL is set but VITE_WS_URL is not, we derive the WS host from
 * the API URL (http→ws, https→wss).
 */
const RAW_API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_HOST ?? 'http://localhost:3000').replace(/\/+$/, '');
const RAW_WS =
  import.meta.env.VITE_WS_URL ??
  import.meta.env.VITE_WS_HOST ??
  RAW_API.replace(/^http(s?):\/\//, (_m: string, s: string) => `ws${s}://`);

export const apiHost: string = RAW_API;
export const wsHost: string = RAW_WS.replace(/\/+$/, '');

export const api: ApiClient | MockApiClient = MOCK_MODE
  ? new MockApiClient()
  : new ApiClient(apiHost, () => localStorage.getItem('jwt') ?? undefined);
