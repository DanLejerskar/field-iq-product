import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiClient } from '../api/client';
import type { SessionRow } from '../api/types';

const api = new ApiClient(
  import.meta.env.VITE_API_HOST ?? 'http://localhost:3000',
  () => localStorage.getItem('jwt') ?? undefined,
);

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

export function LiveSessions() {
  const [selected, setSelected] = useState<string | undefined>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.listSessions(),
    refetchInterval: 5000,
  });
  const sessions = data?.sessions ?? [];
  const selectedSession = sessions.find((s) => s.id === selected);

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
        </div>
      </header>

      <aside className="session-list">
        <h2>Sessions</h2>
        {isLoading ? (
          <div style={{ padding: 16 }}>
            <span className="spinner" /> Loading…
          </div>
        ) : error ? (
          <div style={{ padding: 16, color: 'var(--error)' }}>{String(error)}</div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--ink-faint)' }}>No sessions yet.</div>
        ) : (
          sessions.map((s) => (
            <SessionRowEl
              key={s.id}
              row={s}
              selected={s.id === selected}
              onClick={() => setSelected(s.id)}
            />
          ))
        )}
      </aside>

      <main className="main">
        {selectedSession ? (
          <SessionDetail row={selectedSession} />
        ) : (
          <div className="main__empty">Pick a session from the left to see live details.</div>
        )}
      </main>
    </div>
  );
}

function SessionRowEl({
  row,
  selected,
  onClick,
}: {
  row: SessionRow;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <a
      className={`session-row ${selected ? 'session-row--selected' : ''}`}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      href="#"
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

function SessionDetail({ row }: { row: SessionRow }) {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Session {row.id.slice(0, 8)}</h1>
      <div style={{ color: 'var(--ink-dim)' }}>
        Started {timeAgo(row.startedAt)} ago · Procedure v{row.procedureVersion} · Status{' '}
        {row.status}
      </div>
      <p style={{ color: 'var(--ink-faint)', marginTop: 32 }}>
        Live step strip, photo feed, and coach notes land in the next M8 chunk.
      </p>
    </div>
  );
}
