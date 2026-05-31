import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { getDemoStore } from '@field-iq/mock-demo';
import { ApiClient } from '../api/client';
import { apiHost } from '../api';
import { AUTH_JWT_KEY } from '../auth/auth';
import { MOCK_MODE } from '../mockMode';
import { useDemoSnapshot } from '../state/useDemoSnapshot';
import type { AuditRow, StepRow } from '../api/types';

const api = new ApiClient(apiHost, () => localStorage.getItem(AUTH_JWT_KEY) ?? undefined);

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
  return MOCK_MODE ? <MockSessionDetail /> : <RealSessionDetail sessionId={sessionId} />;
}

// --- MOCK ---

function MockSessionDetail() {
  const snapshot = useDemoSnapshot();
  const store = getDemoStore();
  const [note, setNote] = useState('');
  const [toast, setToast] = useState<string | undefined>();

  const steps: StepRow[] = snapshot.steps.map((s) => ({
    id: `step-${s.stepNumber}`,
    stepNumber: s.stepNumber,
    title: s.title,
    instruction: s.instruction,
    referenceImageUrl: s.photoDataUri,
    verificationPrompt: s.verificationPrompt,
    successCriteria: null,
    retryThreshold: 3,
  }));
  const audit: AuditRow[] = snapshot.audit.map((a) => ({
    id: a.id,
    sessionId: a.sessionId,
    stepId: a.stepId,
    stepNumber: a.stepNumber,
    eventType: a.eventType,
    photoUrl: a.photoUrl,
    verified: a.verified,
    confidence: a.confidence,
    message: a.message,
    detail: a.detail,
    timestamp: a.timestamp,
    supersededBy: a.supersededBy,
  }));

  function saveNote() {
    if (!note.trim()) return;
    store.addNote(note.trim());
    setNote('');
  }

  function generateReport() {
    setToast(
      'Stub: in Phase 2B this triggers POST /api/sessions/:id/report and the OSHA-signed PDF lands in your downloads.',
    );
    window.setTimeout(() => setToast(undefined), 6000);
  }

  return (
    <DetailView
      audit={audit}
      steps={steps}
      currentStep={snapshot.currentStep}
      status={snapshot.session.status}
      procedureVersion={snapshot.session.procedureVersion}
      startedAt={snapshot.session.startedAt}
      traineeName={snapshot.trainee.fullName}
      note={note}
      onNote={setNote}
      onSaveNote={saveNote}
      onGenerateReport={generateReport}
      toast={toast}
      mockNotes={snapshot.notes}
    />
  );
}

// --- REAL (Phase 1 path; untouched semantics) ---

function RealSessionDetail({ sessionId }: { sessionId: string }) {
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
  if (sessionQ.error) return <ErrorBox message={String(sessionQ.error)} />;
  const detail = sessionQ.data!;
  const audit = auditQ.data?.auditLog ?? [];
  const steps = [...detail.steps].sort((a, b) => a.stepNumber - b.stepNumber);
  return (
    <DetailView
      audit={audit}
      steps={steps}
      currentStep={detail.state.currentStepNumber}
      status={detail.session.status}
      procedureVersion={detail.session.procedureVersion}
      startedAt={detail.session.startedAt}
      traineeName="(trainee)"
      note={note}
      onNote={setNote}
      onSaveNote={() => noteMut.mutate(note)}
      onGenerateReport={() => undefined}
      toast={undefined}
      mockNotes={[]}
    />
  );
}

// --- presentational shell, shared by both ---

interface ViewProps {
  audit: AuditRow[];
  steps: StepRow[];
  currentStep: number;
  status: string;
  procedureVersion: string;
  startedAt: string;
  traineeName: string;
  note: string;
  onNote: (s: string) => void;
  onSaveNote: () => void;
  onGenerateReport: () => void;
  toast?: string;
  mockNotes: Array<{ id: string; timestamp: string; text: string; stepNumber?: number }>;
}

function DetailView(props: ViewProps) {
  const { audit, steps, currentStep, status, procedureVersion, startedAt, traineeName } = props;
  const verdictAudit = audit.filter(
    (a) => a.eventType === 'verified' || a.eventType === 'retry' || a.eventType === 'error',
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, padding: 24 }}>
      <div>
        <h1 style={{ marginTop: 0 }}>{traineeName} · DAC #811 LOTO</h1>
        <div style={{ color: 'var(--ink-dim)', marginBottom: 16 }}>
          Procedure v{procedureVersion} · {status} · Started {new Date(startedAt).toLocaleString()}
        </div>

        <StepStrip steps={steps} current={currentStep} audit={audit} />

        {status === 'completed' ? (
          <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={props.onGenerateReport} style={primaryBtn}>
              Generate report
            </button>
            <span style={{ color: 'var(--ink-faint)' }}>10 / 10 verified · OSHA 1910.147</span>
          </div>
        ) : null}
        {props.toast ? (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              background: 'rgba(91, 168, 214, 0.12)',
              borderRadius: 6,
              color: 'var(--ink-dim)',
              fontSize: 14,
            }}
          >
            {props.toast}
          </div>
        ) : null}

        <h3 style={{ marginTop: 32, color: 'var(--ink-dim)', fontSize: 13, letterSpacing: 1 }}>
          STEP FEED
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {verdictAudit.map((a) => (
            <AuditCard key={a.id} row={a} step={steps.find((s) => s.stepNumber === a.stepNumber)} />
          ))}
          {verdictAudit.length === 0 ? (
            <div style={{ color: 'var(--ink-faint)' }}>No verdicts yet.</div>
          ) : null}
        </div>
      </div>

      <aside>
        <h3 style={{ marginTop: 0, color: 'var(--ink-dim)', fontSize: 13, letterSpacing: 1 }}>
          COACH NOTES
        </h3>
        <textarea
          value={props.note}
          onChange={(e) => props.onNote(e.target.value)}
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
          onClick={props.onSaveNote}
          disabled={!props.note.trim()}
          style={{
            marginTop: 8,
            background: 'var(--field)',
            color: 'var(--ink)',
            border: 0,
            padding: '10px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            opacity: !props.note.trim() ? 0.4 : 1,
          }}
        >
          Save note
        </button>

        <div style={{ marginTop: 24 }}>
          {props.mockNotes.map((n) => (
            <div
              key={n.id}
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
                {new Date(n.timestamp).toLocaleTimeString()}
                {n.stepNumber ? ` · step ${n.stepNumber}` : ''}
              </div>
              <div>{n.text}</div>
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
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: row.photoUrl ? '120px 1fr' : '1fr',
          gap: 12,
        }}
      >
        {row.photoUrl ? (
          <img
            src={row.photoUrl}
            alt=""
            style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 6 }}
          />
        ) : null}
        <div>
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
            <div style={{ color: 'var(--ink-faint)', fontSize: 13, marginTop: 4 }}>
              {row.detail}
            </div>
          ) : null}
        </div>
      </div>
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

function ErrorBox({ message }: { message: string }) {
  return <div style={{ color: 'var(--error)' }}>{message}</div>;
}

const primaryBtn = {
  background: 'var(--field)',
  color: 'var(--ink)',
  border: 0,
  padding: '10px 16px',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
} as const;
