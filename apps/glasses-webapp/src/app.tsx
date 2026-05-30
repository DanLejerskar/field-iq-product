/**
 * Glasses Web App root.
 *
 * Two modes:
 *  - Phase-2A DEMO (MOCK_MODE, default in prod): no URL params, no backend.
 *    We hydrate from the @field-iq/mock-demo store and forward its scripted
 *    timeline events directly into the reducer. The 6 HUD card states show
 *    naturally as the timeline progresses.
 *  - Real mode (VITE_MOCK_MODE=false): URL contract per PHASE_1 prompt M6 —
 *    JWT in the URL fragment, session id in `?session=`. Boots REST + WS.
 */
import { useEffect, useReducer, useState } from 'preact/hooks';
import { getDemoStore, STEPS as DEMO_STEPS } from '@field-iq/mock-demo';
import { attachInput } from './input.js';
import { reduce } from './state.js';
import { StepCard } from './StepCard.js';
import { initialState, type SessionEventEnvelope, type StepInfo } from './types.js';
import { connect } from './ws.js';

const MOCK_MODE: boolean = import.meta.env.VITE_MOCK_MODE !== 'false';

interface BootParams {
  token: string;
  sessionId?: string;
  apiHost: string;
  wsHost: string;
}

function readParams(): BootParams {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  return {
    token: fragment.get('token') ?? query.get('token') ?? '',
    sessionId: query.get('session') ?? undefined,
    apiHost: import.meta.env.VITE_API_HOST ?? 'http://localhost:3000',
    wsHost: import.meta.env.VITE_WS_HOST ?? 'ws://localhost:3000',
  };
}

function formatElapsed(startedAt: number): string {
  const sec = Math.floor((Date.now() - startedAt) / 1000);
  const mm = Math.floor(sec / 60)
    .toString()
    .padStart(1, '0');
  const ss = (sec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

async function fetchSession(
  apiHost: string,
  token: string,
  sessionId: string,
): Promise<{ steps: StepInfo[]; currentStep: number }> {
  const res = await fetch(`${apiHost}/api/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load session (${res.status})`);
  const body = (await res.json()) as {
    state: { currentStepNumber: number };
    steps: Array<{
      stepNumber: number;
      title: string;
      instruction: string;
      referenceImageUrl?: string | null;
    }>;
  };
  return {
    currentStep: body.state.currentStepNumber,
    steps: body.steps.map((s) => ({
      stepNumber: s.stepNumber,
      title: s.title,
      instruction: s.instruction,
      referenceImageUrl: s.referenceImageUrl ?? undefined,
    })),
  };
}

export function App() {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [bootError, setBootError] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState('0:00');
  const [startedAt] = useState(Date.now());
  const params = readParams();

  // Tick the elapsed timer once per second.
  useEffect(() => {
    const id = setInterval(() => setElapsed(formatElapsed(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  // Hydrate + drive events.
  useEffect(() => {
    if (MOCK_MODE) {
      const store = getDemoStore();
      const steps: StepInfo[] = DEMO_STEPS.map((s) => ({
        stepNumber: s.stepNumber,
        title: s.title,
        instruction: s.instruction,
        referenceImageUrl: s.photoDataUri,
      }));
      dispatch({
        kind: 'hydrate',
        sessionId: store.getSnapshot().session.id,
        steps,
        currentStep: store.getSnapshot().currentStep,
      });
      dispatch({ kind: 'connection', status: 'open' });
      let lastSeen = 0;
      return store.subscribe((snap) => {
        if (snap.lastEventId <= lastSeen) return;
        // Synthesise an envelope from the snapshot's most recent card state.
        const stepNumber = snap.currentStep;
        const envelope: SessionEventEnvelope = {
          eventId: snap.lastEventId,
          type:
            snap.cardState === 'verified'
              ? 'step.verified'
              : snap.cardState === 'processing'
                ? 'step.verification_started'
                : snap.cardState === 'retry'
                  ? 'step.retry'
                  : snap.cardState === 'error'
                    ? 'step.failed'
                    : snap.cardState === 'complete'
                      ? 'session.completed'
                      : 'session.advanced',
          sessionId: snap.session.id,
          orgId: snap.session.orgId,
          ts: new Date().toISOString(),
          stepNumber,
          message: snap.cardMessage,
        };
        dispatch({ kind: 'event', event: envelope });
        lastSeen = snap.lastEventId;
      });
    }

    if (!params.sessionId || !params.token) return;
    let alive = true;
    fetchSession(params.apiHost, params.token, params.sessionId)
      .then((data) => {
        if (!alive) return;
        dispatch({
          kind: 'hydrate',
          sessionId: params.sessionId!,
          steps: data.steps,
          currentStep: data.currentStep,
        });
      })
      .catch((err: unknown) => {
        if (alive) setBootError(err instanceof Error ? err.message : String(err));
      });

    const client = connect(`${params.wsHost}/ws?token=${encodeURIComponent(params.token)}`, {
      sessionId: params.sessionId,
      getLastEventId: () => state.lastEventId,
      onConnection: (status) => dispatch({ kind: 'connection', status }),
      onEvent: (e: SessionEventEnvelope) => dispatch({ kind: 'event', event: e }),
    });
    return () => {
      alive = false;
      client.close();
    };
  }, [params.sessionId, params.token, params.apiHost, params.wsHost]);

  // Input — keyboard in dev, Meta gestures in prod.
  useEffect(() => {
    return attachInput({
      onEnter: async () => {
        if (state.cardState === 'verified' && params.sessionId) {
          await fetch(`${params.apiHost}/api/sessions/${params.sessionId}/advance`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${params.token}` },
          });
        }
      },
      onCancel: () => {
        /* Reserved for the supervisor-confirmed abandon flow (M8). */
      },
      onSwipeLeft: () => dispatch({ kind: 'toggle-reference' }),
      onSwipeRight: () => dispatch({ kind: 'toggle-reference' }),
      onSwipeUp: () => undefined,
      onSwipeDown: () => undefined,
    });
  }, [state.cardState, params.sessionId, params.apiHost, params.token]);

  if (bootError) {
    return <div class="hud__error-overlay">Could not load session: {bootError}</div>;
  }
  if (!MOCK_MODE && !params.token) {
    return (
      <div class="hud__error-overlay">
        Missing access token — open this URL from the Meta AI app's app list.
      </div>
    );
  }

  return (
    <StepCard
      state={state}
      elapsed={elapsed}
      onVerify={() => {
        /* photo capture happens on the companion (M7) */
      }}
    />
  );
}
