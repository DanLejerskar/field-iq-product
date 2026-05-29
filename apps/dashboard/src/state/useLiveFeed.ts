/** React hook bridging the WS client to the reduceFeed reducer. */
import { useEffect, useReducer } from 'react';
import { connect } from '../api/ws';
import { initialFeed, reduceFeed, type FeedState, type SessionEnvelope } from './feed';
import type { SessionRow } from '../api/types';

interface Options {
  wsHost: string;
  token: string;
  orgId: string;
  initialSessions: SessionRow[];
}

export interface LiveFeed {
  state: FeedState;
  connection: 'connecting' | 'open' | 'paused';
}

export function useLiveFeed({ wsHost, token, orgId, initialSessions }: Options): LiveFeed {
  const [state, dispatch] = useReducer(reduceFeed, {
    ...initialFeed,
    sessions: initialSessions,
  });

  type Action = Parameters<typeof reduceFeed>[1];

  useEffect(() => {
    dispatch({ kind: 'hydrate', sessions: initialSessions } satisfies Action);
  }, [initialSessions]);

  // Use a ref-like closure for lastEventId so connect() always sees the latest.
  const latest: { lastEventId: number; connection: 'connecting' | 'open' | 'paused' } = {
    lastEventId: state.lastEventId,
    connection: 'connecting',
  };

  useEffect(() => {
    if (!token || !orgId) return;
    const client = connect(wsHost, token, {
      channel: `org:${orgId}:sessions`,
      getLastEventId: () => latest.lastEventId,
      onConnection: (status) => {
        latest.connection = status;
      },
      onEvent: (e: SessionEnvelope) => {
        latest.lastEventId = Math.max(latest.lastEventId, e.eventId);
        dispatch({ kind: 'event', event: e } satisfies Action);
      },
    });
    return () => client.close();
  }, [wsHost, token, orgId]);

  return { state, connection: latest.connection };
}
