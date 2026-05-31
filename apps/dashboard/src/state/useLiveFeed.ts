/** React hook bridging the WS client to the reduceFeed reducer.
 *
 * In demo mode (MOCK_MODE), instead of opening a WebSocket we subscribe to
 * the @field-iq/mock-demo store and forward its scripted events into the same
 * reducer. The pages don't know the difference. */
import { useEffect, useReducer, useState } from 'react';
import { getDemoStore } from '@field-iq/mock-demo';
import { MOCK_MODE } from '../api';
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
  const [connection, setConnection] = useState<'connecting' | 'open' | 'paused'>('connecting');

  type Action = Parameters<typeof reduceFeed>[1];

  useEffect(() => {
    dispatch({ kind: 'hydrate', sessions: initialSessions } satisfies Action);
  }, [initialSessions]);

  useEffect(() => {
    if (MOCK_MODE) {
      const store = getDemoStore();
      setConnection('open');
      let lastSeen = 0;
      return store.subscribe((snap) => {
        // Replay any new audit-derived envelopes into reduceFeed so the right rail
        // updates and the KPI strip recounts.
        for (const a of snap.audit) {
          const id = Number(a.id.replace(/^audit-/, '')) || 0;
          if (id <= lastSeen) continue;
          const type =
            a.eventType === 'verified'
              ? 'step.verified'
              : a.eventType === 'retry'
                ? 'step.retry'
                : a.eventType === 'photo_submitted'
                  ? 'step.verification_started'
                  : a.eventType === 'complete'
                    ? 'session.completed'
                    : null;
          if (!type) continue;
          const envelope: SessionEnvelope = {
            eventId: id,
            type,
            sessionId: a.sessionId,
            orgId: snap.session.orgId,
            ts: a.timestamp,
            stepNumber: a.stepNumber ?? undefined,
            message: a.message ?? undefined,
          };
          dispatch({ kind: 'event', event: envelope } satisfies Action);
          lastSeen = id;
        }
      });
    }

    if (!token || !orgId) return;
    const client = connect(wsHost, token, {
      channel: `org:${orgId}:sessions`,
      getLastEventId: () => state.lastEventId,
      onConnection: setConnection,
      onEvent: (e: SessionEnvelope) => {
        dispatch({ kind: 'event', event: e } satisfies Action);
      },
    });
    return () => client.close();
  }, [wsHost, token, orgId]);

  return { state, connection };
}
