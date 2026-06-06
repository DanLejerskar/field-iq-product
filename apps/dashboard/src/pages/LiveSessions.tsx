import { useQuery } from '@tanstack/react-query';
import { useMemo, useSyncExternalStore } from 'react';
import { getDemoStore } from '@field-iq/mock-demo';
import { api, apiHost, MOCK_MODE, wsHost } from '../api';
import { loadAuth } from '../auth/auth';
import { go } from '../router';
import { useLiveFeed } from '../state/useLiveFeed';
import type { SessionRow } from '../api/types';

const demoStore = getDemoStore();

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function readJwtOrg(): { jwt: string; orgId: string } {
  const auth = loadAuth();
  return { jwt: auth?.jwt ?? '', orgId: auth?.org.id ?? '' };
}

function useDemoSnapshot() {
  return useSyncExternalStore(
    (cb) => demoStore.subscribe(cb),
    () => demoStore.getSnapshot(),
    () => demoStore.getSnapshot(),
  );
}

export function LiveSessions() {
  const { jwt, orgId } = useMemo(readJwtOrg, []);
  const snapshot = useDemoSnapshot();
  const initialQ = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.listSessions(),
    refetchInterval: MOCK_MODE || orgId ? false : 5000,
  });
  const initialSessions = initialQ.data?.sessions ?? [];
  const { state, connection } = useLiveFeed({
    wsHost,
    token: jwt,
    orgId,
    initialSessions,
  });
  const sessions = state.sessions.length > 0 ? state.sessions : initialSessions;
  const traineeName = MOCK_MODE ? snapshot.trainee.fullName : 'Technician';

  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand">
          EON Field IQ · Trainer Dashboard
          {MOCK_MODE ? (
            <span
              style={{
                marginLeft: 12,
                fontSize: 11,
                background: 'var(--field)',
                color: '#0B1424',
                padding: '2px 8px',
                borderRadius: 4,
                fontWeight: 700,
                letterSpacing: 0.5,
              }}
            >
              DEMO
            </span>
          ) : null}
        </div>
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
      {!MOCK_MODE && connection !== 'open' ? (
        <div
          style={{
            gridColumn: '1 / -1',
            padding: '8px 16px',
            background:
              connection === 'paused' ? 'rgba(240, 178, 58, 0.15)' : 'rgba(91, 168, 214, 0.12)',
            color: connection === 'paused' ? 'var(--retry)' : 'var(--ink-dim)',
            fontSize: 13,
            borderBottom: '1px solid var(--border)',
          }}
        >
          {connection === 'paused'
            ? `⚠ Backend unreachable at ${apiHost} — retrying…`
            : `Connecting to backend at ${apiHost}…`}
        </div>
      ) : null}

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
          sessions.map((s) => <Row key={s.id} row={s} traineeName={traineeName} />)
        )}
      </aside>

      <main className="main">
        <div className="main__empty">
          {sessions[0] ? (
            <a
              href={`#/sessions/${sessions[0].id}`}
              style={{ color: 'var(--field)', textDecoration: 'none' }}
              onClick={(e) => {
                e.preventDefault();
                go({ name: 'session', id: sessions[0]!.id });
              }}
            >
              Open the active session →
            </a>
          ) : (
            <span>No active session.</span>
          )}
        </div>
      </main>
    </div>
  );
}

function Row({ row, traineeName }: { row: SessionRow; traineeName: string }) {
  return (
    <a
      className="session-row"
      onClick={(e) => {
        e.preventDefault();
        go({ name: 'session', id: row.id });
      }}
      href={`#/sessions/${row.id}`}
    >
      <div className="session-row__technician">{traineeName} · DAC #811</div>
      <div className="session-row__meta">
        <span>{timeAgo(row.startedAt)} ago</span>
        <span className={`session-row__status session-row__status--${row.status}`}>
          {row.status}
        </span>
        <a
          href={`#/sessions/${row.id}/replay`}
          data-testid={`session-row-replay-${row.id}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            go({ name: 'replay', id: row.id });
          }}
          style={{
            marginLeft: 'auto',
            color: 'var(--field)',
            textDecoration: 'none',
            fontSize: 12,
          }}
        >
          Replay ▸
        </a>
      </div>
    </a>
  );
}
