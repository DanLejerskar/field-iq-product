import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ApiClient } from '../api/client';
import { go } from '../router';
import { useLiveFeed } from '../state/useLiveFeed';
import type { SessionRow } from '../api/types';

const api = new ApiClient(
  import.meta.env.VITE_API_HOST ?? 'http://localhost:3000',
  () => localStorage.getItem('jwt') ?? undefined,
);
const wsHost = import.meta.env.VITE_WS_HOST ?? 'ws://localhost:3000';

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function readJwtOrg(): { jwt: string; orgId: string } {
  const jwt = localStorage.getItem('jwt') ?? '';
  let orgId = '';
  try {
    const [, payloadB64] = jwt.split('.');
    if (payloadB64) {
      const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))) as {
        org?: string;
      };
      orgId = payload.org ?? '';
    }
  } catch {
    /* no jwt */
  }
  return { jwt, orgId };
}

export function LiveSessions() {
  const { jwt, orgId } = useMemo(readJwtOrg, []);
  const initialQ = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.listSessions(),
    refetchInterval: orgId ? false : 5000,
  });
  const initialSessions = initialQ.data?.sessions ?? [];
  const { state, connection } = useLiveFeed({
    wsHost,
    token: jwt,
    orgId,
    initialSessions,
  });
  const sessions = state.sessions.length > 0 ? state.sessions : initialSessions;

  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand">EON Field IQ · Trainer Dashboard</div>
        <div className="kpi-strip">
          <div className="kpi">
            <strong>{sessions.filter((s) => s.status === 'active').length}</strong>active
          </div>
          <div className="kpi">
            <strong>{sessions.filter((s) => s.status === 'completed').length}</strong>completed
          </div>
          <div className="kpi">
            <strong>{sessions.length}</strong>total
          </div>
          <div
            className="kpi"
            style={{ color: connection === 'paused' ? 'var(--retry)' : 'var(--ink-faint)' }}
          >
            ● {connection}
          </div>
          <a href="#/history" style={{ color: 'var(--field)', textDecoration: 'none' }}>
            history
          </a>
          <a href="#/admin" style={{ color: 'var(--field)', textDecoration: 'none' }}>
            admin
          </a>
        </div>
      </header>

      <aside className="session-list">
        <h2>Sessions</h2>
        {initialQ.isLoading ? (
          <div style={{ padding: 16 }}>
            <span className="spinner" /> Loading…
          </div>
        ) : initialQ.error ? (
          <div style={{ padding: 16, color: 'var(--error)' }}>{String(initialQ.error)}</div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--ink-faint)' }}>No sessions yet.</div>
        ) : (
          sessions.map((s) => <Row key={s.id} row={s} />)
        )}
      </aside>

      <main className="main">
        <div className="main__empty">
          Pick a session from the left, or open one from{' '}
          <a href="#/history" style={{ color: 'var(--field)' }}>
            history
          </a>
          .
        </div>
      </main>
    </div>
  );
}

function Row({ row }: { row: SessionRow }) {
  return (
    <a
      className="session-row"
      onClick={(e) => {
        e.preventDefault();
        go({ name: 'session', id: row.id });
      }}
      href={`#/sessions/${row.id}`}
    >
      <div className="session-row__technician">Session {row.id.slice(0, 8)}</div>
      <div className="session-row__meta">
        <span>{timeAgo(row.startedAt)} ago</span>
        <span className={`session-row__status session-row__status--${row.status}`}>
          {row.status}
        </span>
      </div>
    </a>
  );
}
