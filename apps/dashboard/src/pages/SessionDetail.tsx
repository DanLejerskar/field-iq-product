import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiClient } from '../api/client';
import type { AuditRow, StepRow } from '../api/types';

const api = new ApiClient(
  import.meta.env.VITE_API_HOST ?? 'http://localhost:3000',
  () => localStorage.getItem('jwt') ?? undefined,
);

const STEP_COLORS: Record<string, string> = {
  pending: 'var(--ink-faint)',
  inProgress: 'var(--field)',
  verified: 'var(--verified)',
  retried: 'var(--retry)',
  failed: 'var(--error)',
};

function stepDotState(
  stepNumber: number,
  current: number,
  audit: AuditRow[],
): keyof typeof STEP_COLORS {
  const forStep = audit.filter((a) => a.stepNumber === stepNumber);
  if (forStep.some((a) => a.eventType === 'verified' && !a.supersededBy)) return 'verified';
  if (forStep.some((a) => a.eventType === 'error')) return 'failed';
  if (forStep.some((a) => a.eventType === 'retry')) return 'retried';
  if (stepNumber === current) return 'inProgress';
  return 'pending';
}

export function SessionDetail({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');

  const sessionQ = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.getSession(sessionId),
    refetchInterval: 5000,
  });
  const auditQ = useQuery({
    queryKey: ['session', sessionId, 'audit'],
    queryFn: () => api.getSessionAudit(sessionId),
    refetchInterval: 5000,
  });
  const noteMut = useMutation({
    mutationFn: (text: string) =>
      api.postNote(sessionId, text, sessionQ.data?.state.currentStepNumber),
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['session', sessionId, 'audit'] });
    },
  });

  if (sessionQ.isLoading) return <Spinner />;
  if (sessionQ.error) return <Error message={String(sessionQ.error)} />;
  const detail = sessionQ.data!;
  const audit = auditQ.data?.auditLog ?? [];
  const current = detail.state.currentStepNumber;
  const steps = [...detail.steps].sort((a, b) => a.stepNumber - b.stepNumber);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
      <div>
        <h1 style={{ marginTop: 0 }}>Session {sessionId.slice(0, 8)}</h1>
        <div style={{ color: 'var(--ink-dim)', marginBottom: 16 }}>
          Procedure v{detail.session.procedureVersion} · {detail.session.status} · Started{' '}
          {new Date(detail.session.startedAt).toLocaleString()}
        </div>

        <StepStrip steps={steps} current={current} audit={audit} />

        <h3 style={{ marginTop: 32, color: 'var(--ink-dim)', fontSize: 13, letterSpacing: 1 }}>
          STEP FEED
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {audit
            .filter(
              (a) =>
                a.eventType === 'verified' || a.eventType === 'retry' || a.eventType === 'error',
            )
            .map((a) => (
              <AuditCard
                key={a.id}
                row={a}
                step={steps.find((s) => s.stepNumber === a.stepNumber)}
              />
            ))}
          {audit.length === 0 ? (
            <div style={{ color: 'var(--ink-faint)' }}>No verdicts yet.</div>
          ) : null}
        </div>
      </div>

      <aside>
        <h3 style={{ marginTop: 0, color: 'var(--ink-dim)', fontSize: 13, letterSpacing: 1 }}>
          COACH NOTES
        </h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          style={{
            width: '100%',
            background: 'var(--bg-elev)',
            color: 'var(--ink)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
          placeholder="Observations append to the audit log…"
        />
        <button
          onClick={() => noteMut.mutate(note)}
          disabled={!note.trim() || noteMut.isPending}
          style={{
            marginTop: 8,
            background: 'var(--field)',
            color: 'var(--ink)',
            border: 0,
            padding: '10px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            opacity: !note.trim() ? 0.4 : 1,
          }}
        >
          {noteMut.isPending ? 'Saving…' : 'Save note'}
        </button>

        <div style={{ marginTop: 24 }}>
          {audit
            .filter((a) => a.eventType === 'note')
            .map((a) => (
              <div
                key={a.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                  fontSize: 14,
                }}
              >
                <div style={{ color: 'var(--ink-faint)', fontSize: 12, marginBottom: 4 }}>
                  {new Date(a.timestamp).toLocaleTimeString()}
                  {a.stepNumber ? ` · step ${a.stepNumber}` : ''}
                </div>
                <div>{a.detail}</div>
              </div>
            ))}
        </div>
      </aside>
    </div>
  );
}

function StepStrip({
  steps,
  current,
  audit,
}: {
  steps: StepRow[];
  current: number;
  audit: AuditRow[];
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      {steps.map((s) => {
        const state = stepDotState(s.stepNumber, current, audit);
        return (
          <div key={s.id} style={{ textAlign: 'center', minWidth: 64 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                margin: '0 auto 6px',
                background: STEP_COLORS[state],
                outline: s.stepNumber === current ? '2px solid var(--ink)' : 'none',
                outlineOffset: 2,
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--ink-dim)' }}>{s.stepNumber}</div>
          </div>
        );
      })}
    </div>
  );
}

function AuditCard({ row, step }: { row: AuditRow; step?: StepRow }) {
  const color =
    row.eventType === 'verified'
      ? 'var(--verified)'
      : row.eventType === 'error'
        ? 'var(--error)'
        : 'var(--retry)';
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${color}`,
        borderRadius: 8,
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <strong>
          Step {row.stepNumber} · {step?.title ?? ''}
        </strong>
        <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>
          {new Date(row.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div style={{ color: 'var(--ink-dim)', fontSize: 14 }}>{row.message}</div>
      {row.detail ? (
        <div style={{ color: 'var(--ink-faint)', fontSize: 13, marginTop: 4 }}>{row.detail}</div>
      ) : null}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ padding: 16 }}>
      <span className="spinner" /> Loading…
    </div>
  );
}

function Error({ message }: { message: string }) {
  return <div style={{ color: 'var(--error)' }}>{message}</div>;
}
