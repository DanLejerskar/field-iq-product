import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ApiClient } from '../api/client';
import { MOCK_MODE } from '../mockMode';
import { go } from '../router';
import { useDemoSnapshot } from '../state/useDemoSnapshot';
import type { SessionRow, SessionStatus } from '../api/types';

const api = new ApiClient(
  import.meta.env.VITE_API_HOST ?? 'http://localhost:3000',
  () => localStorage.getItem('jwt') ?? undefined,
);

const STATUSES: Array<'all' | SessionStatus> = [
  'all',
  'active',
  'completed',
  'abandoned',
  'failed',
];

export function History() {
  const [status, setStatus] = useState<'all' | SessionStatus>('all');
  const snapshot = useDemoSnapshot();
  const { data, isLoading, error } = useQuery({
    queryKey: ['history', status],
    queryFn: () => api.listSessions(status === 'all' ? undefined : status),
    enabled: !MOCK_MODE,
  });

  const rows: SessionRow[] = useMemo(() => {
    if (MOCK_MODE) {
      const s: SessionRow = {
        id: snapshot.session.id,
        orgId: snapshot.session.orgId,
        equipmentId: snapshot.session.equipmentId,
        procedureId: snapshot.session.procedureId,
        procedureVersion: snapshot.session.procedureVersion,
        technicianUserId: snapshot.session.technicianUserId,
        status: snapshot.session.status,
        startedAt: snapshot.session.startedAt,
        completedAt: snapshot.session.completedAt,
      };
      return status === 'all' || s.status === status ? [s] : [];
    }
    return data?.sessions ?? [];
  }, [data, status, snapshot]);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>History</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            style={{
              background: status === s ? 'var(--bg-elev)' : 'transparent',
              color: 'var(--ink)',
              border: '1px solid var(--border)',
              padding: '6px 12px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {!MOCK_MODE && isLoading ? (
        <div>
          <span className="spinner" /> Loading…
        </div>
      ) : !MOCK_MODE && error ? (
        <div style={{ color: 'var(--error)' }}>{String(error)}</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ color: 'var(--ink-dim)', textAlign: 'left' }}>
              <th style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                Session
              </th>
              <th style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                Started
              </th>
              <th style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                Status
              </th>
              <th style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                Procedure
              </th>
              <th style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                Report
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 4px' }}>
                  <a
                    href={`#/sessions/${r.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      go({ name: 'session', id: r.id });
                    }}
                    style={{ color: 'var(--field)' }}
                  >
                    {r.id.slice(0, 8)}
                  </a>
                </td>
                <td style={{ padding: '10px 4px', color: 'var(--ink-dim)' }}>
                  {new Date(r.startedAt).toLocaleString()}
                </td>
                <td style={{ padding: '10px 4px' }}>
                  <span
                    className={`session-row__status session-row__status--${r.status}`}
                    style={{ fontSize: 12 }}
                  >
                    {r.status}
                  </span>
                </td>
                <td style={{ padding: '10px 4px', color: 'var(--ink-dim)' }}>
                  v{r.procedureVersion}
                </td>
                <td style={{ padding: '10px 4px', color: 'var(--ink-faint)' }}>
                  PDF export lands in M9
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 16, color: 'var(--ink-faint)' }}>
                  No sessions.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      )}
    </div>
  );
}
