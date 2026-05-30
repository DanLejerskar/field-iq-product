/**
 * Phase 2A — the dashboard ships standalone on Vercel with no backend. The
 * mock layer drives the UI through an in-memory LOTO timeline.
 *
 * Default: ON. Set `VITE_MOCK_MODE=false` in the dev shell to swap in the
 * real ApiClient + WebSocket gateway used in Phase 1.
 */
export const MOCK_MODE: boolean = import.meta.env.VITE_MOCK_MODE !== 'false';
