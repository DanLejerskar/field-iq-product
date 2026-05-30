/**
 * Glasses Web App root.
 *
 * URL contract (PHASE_1 prompt M6): the JWT lives in the URL FRAGMENT (`#token=…`) so
 * it never reaches the server in a GET log. The active session id is a query param
 * (`?session=…`). Without those, we show the home card.
 *
 * The app boots, parses URL, fetches the procedure steps over REST, opens the WS,
 * and dispatches events into the reducer.
 */
import { useEffect, useReducer, useState } from 'preact/hooks';
import { attachInput } from './input.js';
import { reduce } from './state.js';
import { StepCard } from './StepCard.js';
import { initialState, type SessionEventEnvelope, type StepInfo } from './types.js';
import { connect } from './ws.js';

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

  // Hydrate from REST + open WS.
  useEffect(() => {
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
  if (!params.token) {
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
