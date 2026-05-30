/**
 * In demo mode, the @field-iq/mock-demo store mutates on every timeline tick.
 * TanStack Query caches the `api.getSession` etc. results — without a nudge
 * those caches go stale. This hook subscribes to the store and invalidates all
 * queries on each change, so the dashboard's pages re-render against the
 * latest snapshot.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getDemoStore } from '@field-iq/mock-demo';
import { MOCK_MODE } from '../api';

export function useMockSync(): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!MOCK_MODE) return;
    const store = getDemoStore();
    return store.subscribe(() => {
      qc.invalidateQueries();
    });
  }, [qc]);
}
