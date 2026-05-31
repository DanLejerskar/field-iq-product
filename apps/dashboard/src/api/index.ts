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

const apiHost = import.meta.env.VITE_API_HOST ?? 'http://localhost:3000';

export const api: ApiClient | MockApiClient = MOCK_MODE
  ? new MockApiClient()
  : new ApiClient(apiHost, () => localStorage.getItem('jwt') ?? undefined);

export const wsHost: string = import.meta.env.VITE_WS_HOST ?? 'ws://localhost:3000';
