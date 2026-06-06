import { useQuery } from '@tanstack/react-query';
import { fetchReplay, type ReplayResponse } from '../api/replay';

export function useReplay(sessionId: string | null) {
  return useQuery<ReplayResponse>({
    queryKey: ['replay', sessionId],
    queryFn: () => {
      if (!sessionId) {
        return Promise.reject(new Error('No sessionId'));
      }
      return fetchReplay(sessionId);
    },
    enabled: !!sessionId,
    staleTime: 60_000,
  });
}
