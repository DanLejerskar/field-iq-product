/**
 * Right-rail details for the selected event. One render path per type.
 */
import type { ReplayEvent } from '../../api/replay';
import { EVENT_STYLES } from './eventStyles';

interface Props {
  selectedEvent: ReplayEvent | null;
}

function pill(color: string, label: string) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        background: `${color}33`,
        color,
        border: `1px solid ${color}`,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {label}
    </span>
  );
}

function hhmmss(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString();
}

export function ReplayDetailsPanel({ selectedEvent }: Props) {
  if (!selectedEvent) {
    return (
      <div
        data-testid="replay-details-empty"
        style={{
          padding: 24,
          color: 'var(--ink-faint)',
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        Click a dot on the timeline (or a row on the left) to see event details here.
      </div>
    );
  }

  const style = EVENT_STYLES[selectedEvent.type];

  return (
    <div
      data-testid={`replay-details-${selectedEvent.type}`}
      style={{
        padding: 16,
        color: 'var(--ink)',
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 6 }}>{pill(style.color, style.label)}</div>
        <div style={{ color: 'var(--ink-faint)', fontSize: 11 }}>
          {hhmmss(selectedEvent.timestamp)}
          {selectedEvent.stepNumber !== null ? ` · Step ${selectedEvent.stepNumber}` : null}
        </div>
      </header>

      {renderBody(selectedEvent)}
    </div>
  );
}

function renderBody(event: ReplayEvent) {
  switch (event.type) {
    case 'session.started':
      return <p style={{ margin: 0 }}>Session started.</p>;

    case 'step.started':
      return <p style={{ margin: 0 }}>Step {event.stepNumber} started.</p>;

    case 'step.photo_captured':
      return (
        <figure style={{ margin: 0 }}>
          <img
            src={event.payload.photoUrl}
            alt={`Step ${event.stepNumber ?? '?'} photo`}
            style={{
              maxWidth: '100%',
              maxHeight: 600,
              borderRadius: 6,
              border: '1px solid var(--border)',
              display: 'block',
            }}
          />
          <figcaption
            style={{
              marginTop: 8,
              fontSize: 11,
              color: 'var(--ink-faint)',
            }}
          >
            Captured at {hhmmss(event.payload.capturedAt)}
          </figcaption>
        </figure>
      );

    case 'step.verified': {
      const verdict = event.payload.verdict;
      const verdictColor =
        verdict === 'pass' ? '#10B981' : verdict === 'fail' ? '#E0625C' : '#F0B23A';
      return (
        <div>
          <div style={{ marginBottom: 8 }}>{pill(verdictColor, verdict)}</div>
          {event.payload.verdictText ? (
            <blockquote
              style={{
                margin: 0,
                padding: '8px 12px',
                borderLeft: `3px solid ${verdictColor}`,
                background: 'var(--bg-elev)',
                color: 'var(--ink-dim)',
              }}
            >
              {event.payload.verdictText}
            </blockquote>
          ) : null}
          <div style={{ marginTop: 8, color: 'var(--ink-faint)', fontSize: 11 }}>
            Confidence: {(event.payload.confidence * 100).toFixed(0)}%
          </div>
        </div>
      );
    }

    case 'step.retry':
      return (
        <div
          style={{
            padding: 12,
            background: 'rgba(240, 178, 58, 0.12)',
            border: '1px solid #F0B23A',
            borderRadius: 6,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Retry requested.</div>
          <div>{event.payload.reason || '(no reason given)'}</div>
          {event.payload.previousVerdictText ? (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-faint)' }}>
              Previous: {event.payload.previousVerdictText}
            </div>
          ) : null}
        </div>
      );

    case 'worker_dialogue': {
      const sev = event.payload.severity;
      return (
        <div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ marginRight: 8 }}>
              {pill('#A78BFA', event.payload.intent.replace('_', ' '))}
            </span>
            {sev ? pill('#E0625C', sev) : null}
          </div>
          <blockquote
            style={{
              margin: 0,
              padding: '8px 12px',
              borderLeft: '3px solid #A78BFA',
              background: 'var(--bg-elev)',
              color: 'var(--ink)',
            }}
          >
            🎙 “{event.payload.transcript}”
          </blockquote>
          {event.payload.aiResponse ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>AI response</div>
              <div>{event.payload.aiResponse}</div>
            </div>
          ) : null}
        </div>
      );
    }

    case 'safety_alert':
      return (
        <div
          style={{
            padding: 12,
            background: 'rgba(224, 98, 92, 0.12)',
            border: '1px solid #E0625C',
            borderRadius: 6,
          }}
        >
          <div style={{ marginBottom: 8 }}>{pill('#E0625C', event.payload.severity)}</div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
            ⚠ {event.payload.summary}
          </div>
          <div>
            <span style={{ color: 'var(--ink-faint)', fontSize: 11 }}>Recommended action</span>
            <div>{event.payload.recommendedAction}</div>
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: 'var(--ink-faint)',
            }}
          >
            Detected by:{' '}
            {event.payload.detectedBy === 'ai' ? 'AI monitor' : 'Critical-keyword fast path'}
          </div>
        </div>
      );

    case 'session.ended':
      return <p style={{ margin: 0 }}>Session ended.</p>;
  }
}
