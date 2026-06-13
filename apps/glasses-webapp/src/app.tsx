/**
 * Glasses Web App root.
 *
 * Three boot paths:
 *  1. Phase-2A DEMO (MOCK_MODE, the production default for the Vercel build):
 *     no URL params, no backend. Hydrate from the @field-iq/mock-demo store and
 *     forward its scripted timeline events directly into the reducer.
 *  2. Meta companion app (real mode + URL fragment token): the companion
 *     supplies `#token=…&session=…`; we boot REST + WS as in Phase 1.
 *  3. Manual browser sign-in (real mode + magic link): the user lands on the
 *     Vercel URL directly, hits the `<SignIn>` fallback below the "no token"
 *     gate, receives a magic link, and either clicks it (lands on
 *     `#/auth/verify?token=…`) or pastes the token. We persist the JWT in
 *     localStorage and the rest of the flow works exactly like path 2.
 */
import { useEffect, useReducer, useState } from 'preact/hooks';
import { getDemoStore, STEPS as DEMO_STEPS } from '@field-iq/mock-demo';
import {
  clearAuth,
  hydrateAuthFromJwt,
  loadAuth,
  parseSessionFromHash,
  parseTokenFromHash,
  storeAuth,
  verifyMagicLink,
  type AuthPayload,
} from './auth.js';
import { attachInput } from './input.js';
import { downscalePhoto } from './photo.js';
import { SignIn } from './SignIn.js';
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

function envHosts(): { apiHost: string; wsHost: string } {
  const apiHost = (
    import.meta.env.VITE_API_URL ??
    import.meta.env.VITE_API_HOST ??
    'http://localhost:3000'
  ).replace(/\/+$/, '');
  const wsHost = (
    import.meta.env.VITE_WS_URL ??
    import.meta.env.VITE_WS_HOST ??
    apiHost.replace(/^http(s?):\/\//, (_m: string, s: string) => `ws${s}://`)
  ).replace(/\/+$/, '');
  return { apiHost, wsHost };
}

function readParams(): BootParams {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const fragmentToken = fragment.get('token') ?? query.get('token') ?? '';
  const storedToken = loadAuth()?.jwt ?? '';
  return {
    token: fragmentToken || storedToken,
    sessionId: query.get('session') ?? undefined,
    ...envHosts(),
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
): Promise<{
  steps: StepInfo[];
  currentStep: number;
  sessionStatus: string;
  stepStatuses: Array<{ stepNumber: number; status: string }>;
}> {
  const res = await fetch(`${apiHost}/api/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load session (${res.status})`);
  const body = (await res.json()) as {
    state: {
      currentStepNumber: number;
      status: string;
      steps?: Array<{ stepNumber: number; status: string }>;
    };
    steps: Array<{
      stepNumber: number;
      title: string;
      instruction: string;
      referenceImageUrl?: string | null;
    }>;
  };
  return {
    currentStep: body.state.currentStepNumber,
    sessionStatus: body.state.status,
    stepStatuses: (body.state.steps ?? []).map((s) => ({
      stepNumber: s.stepNumber,
      status: s.status,
    })),
    steps: body.steps.map((s) => ({
      stepNumber: s.stepNumber,
      title: s.title,
      instruction: s.instruction,
      referenceImageUrl: s.referenceImageUrl ?? undefined,
    })),
  };
}

/**
 * Start a fresh LOTO session for the signed-in technician: pick the first
 * piece of equipment in their org, resolve its active procedure, and POST
 * /api/sessions. Returns the new session id. Phase 2D plumbing — production
 * flow would have the companion app scan a QR code.
 */
async function startSession(apiHost: string, token: string): Promise<string> {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const eqRes = await fetch(`${apiHost}/api/admin/equipment`, { headers });
  if (!eqRes.ok) throw new Error(`Could not list equipment (${eqRes.status})`);
  const equipmentList = (await eqRes.json()) as Array<{ id: string; qrCodeValue: string }>;
  const equipment = equipmentList[0];
  if (!equipment) throw new Error('No equipment seeded for this org');
  const resolved = await fetch(`${apiHost}/api/equipment/resolve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ qrValue: equipment.qrCodeValue }),
  });
  if (!resolved.ok) throw new Error(`Could not resolve procedure (${resolved.status})`);
  const { activeProcedure } = (await resolved.json()) as {
    activeProcedure: { id: string } | null;
  };
  if (!activeProcedure) throw new Error('Equipment has no active procedure');
  const create = await fetch(`${apiHost}/api/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ equipmentId: equipment.id, procedureId: activeProcedure.id }),
  });
  if (!create.ok) throw new Error(`Could not create session (${create.status})`);
  const { sessionId } = (await create.json()) as { sessionId: string };
  return sessionId;
}

async function uploadPhoto(
  apiHost: string,
  token: string,
  sessionId: string,
  stepNumber: number,
  file: File,
): Promise<void> {
  // Camera files are 3–6 MB and the backend caps bodies ~1 MB (413 otherwise);
  // shrink to an upload-sized JPEG first. Fall back to the raw file if the
  // browser can't do canvas work — better an occasional 413 than a dead button.
  const upload: Blob = await downscalePhoto(file).catch(() => file);
  const buf = await upload.arrayBuffer();
  // btoa(String.fromCharCode(...new Uint8Array(buf))) blows the stack on large files,
  // so chunk through TextEncoder + base64 manually.
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const photoBase64 = btoa(binary);
  const res = await fetch(`${apiHost}/api/sessions/${sessionId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ stepNumber, photoBase64 }),
  });
  if (!res.ok) throw new Error(`Photo upload failed (${res.status})`);
}

type AuthState =
  | { kind: 'mock' }
  | { kind: 'verifying-token'; token: string }
  | { kind: 'hydrating-session'; jwt: string }
  | { kind: 'authed'; auth: AuthPayload }
  | { kind: 'anon'; error?: string };

function initialAuth(): AuthState {
  if (MOCK_MODE) return { kind: 'mock' };
  if (typeof window !== 'undefined') {
    const session = parseSessionFromHash(window.location.hash);
    if (session) return { kind: 'hydrating-session', jwt: session };
    const token = parseTokenFromHash(window.location.hash);
    if (token) return { kind: 'verifying-token', token };
  }
  const existing = loadAuth();
  if (existing) return { kind: 'authed', auth: existing };
  return { kind: 'anon' };
}

export function App() {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [bootError, setBootError] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState('0:00');
  const [startedAt] = useState(Date.now());
  const [authState, setAuthState] = useState<AuthState>(initialAuth);
  const [showSignIn, setShowSignIn] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  // wsHost lives on params (via envHosts) for the realtime path; pull apiHost
  // separately so the SignIn / start-session affordances don't depend on URL state.
  const { apiHost } = envHosts();
  const params = readParams();

  // Tick the elapsed timer once per second.
  useEffect(() => {
    const id = setInterval(() => setElapsed(formatElapsed(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  // Magic-link landing routes:
  //   #/auth/verify?session=<jwt> — backend already minted; hydrate user+org
  //   #/auth/verify?token=<hmac>  — legacy paste-token path; POST to verify
  // Either way: persist payload, strip hash, rerender authed.
  useEffect(() => {
    if (authState.kind === 'hydrating-session') {
      let cancelled = false;
      hydrateAuthFromJwt(apiHost, authState.jwt)
        .then((payload) => {
          if (cancelled) return;
          storeAuth(payload);
          const url = window.location.pathname + window.location.search;
          window.history.replaceState(null, '', url || '/');
          setAuthState({ kind: 'authed', auth: payload });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          clearAuth();
          setAuthState({
            kind: 'anon',
            error: err instanceof Error ? err.message : String(err),
          });
        });
      return () => {
        cancelled = true;
      };
    }
    if (authState.kind !== 'verifying-token') return;
    let cancelled = false;
    verifyMagicLink(apiHost, authState.token)
      .then((payload) => {
        if (cancelled) return;
        storeAuth(payload);
        const url = window.location.pathname + window.location.search;
        window.history.replaceState(null, '', url || '/');
        setAuthState({ kind: 'authed', auth: payload });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        clearAuth();
        setAuthState({ kind: 'anon', error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [authState.kind, apiHost]);

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

  // Verdict safety net: while a photo is being reviewed, poll the session
  // REST state every few seconds. If the WS missed the verdict (iOS kills the
  // socket during camera capture), this catches the session up: advanced →
  // next step, retrying → retake banner, completed → done. The reducer only
  // applies poll-sync while cardState is 'processing', so WS events always win.
  useEffect(() => {
    if (MOCK_MODE) return;
    if (state.cardState !== 'processing' || !params.sessionId || !params.token) return;
    const stepAtPollStart = state.currentStep;
    const timer = setInterval(() => {
      fetchSession(params.apiHost, params.token, params.sessionId!)
        .then((data) => {
          dispatch({
            kind: 'poll-sync',
            sessionStatus: data.sessionStatus,
            currentStep: data.currentStep,
            stepStatus: data.stepStatuses.find((s) => s.stepNumber === stepAtPollStart)?.status,
          });
        })
        .catch(() => {
          /* transient poll failures are fine — next tick retries */
        });
    }, 4000);
    return () => clearInterval(timer);
  }, [state.cardState, state.currentStep, params.sessionId, params.token, params.apiHost]);

  // Advance past a verified step. Pinch (glasses) and tap (phone) share this.
  const advanceStep = async () => {
    if (state.cardState === 'verified' && params.sessionId) {
      await fetch(`${params.apiHost}/api/sessions/${params.sessionId}/advance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${params.token}` },
      });
    }
  };

  // Input — keyboard in dev, Meta gestures in prod.
  useEffect(() => {
    return attachInput({
      onEnter: advanceStep,
      onCancel: () => {
        /* Reserved for the supervisor-confirmed abandon flow (M8). */
      },
      onSwipeLeft: () => dispatch({ kind: 'toggle-reference' }),
      onSwipeRight: () => dispatch({ kind: 'toggle-reference' }),
      onSwipeUp: () => undefined,
      onSwipeDown: () => undefined,
    });
  }, [state.cardState, params.sessionId, params.apiHost, params.token]);

  if (authState.kind === 'verifying-token' || authState.kind === 'hydrating-session') {
    return <div class="hud__error-overlay">Signing you in…</div>;
  }

  if (authState.kind === 'anon' && !params.token) {
    return (
      <div class="hud__error-overlay" style={{ flexDirection: 'column', gap: 12 }}>
        <div>Missing access token — open this URL from the Meta AI app's app list.</div>
        {authState.error ? (
          <div style={{ color: 'var(--accent-error)', fontSize: 13 }}>{authState.error}</div>
        ) : null}
        {showSignIn ? (
          <SignIn
            apiHost={apiHost}
            onSignedIn={(payload) => setAuthState({ kind: 'authed', auth: payload })}
          />
        ) : (
          <button class="hud__verify" style={{ marginTop: 12 }} onClick={() => setShowSignIn(true)}>
            Sign in manually (browser testing)
          </button>
        )}
      </div>
    );
  }

  if (bootError) {
    return <div class="hud__error-overlay">Could not load session: {bootError}</div>;
  }

  // Signed in (auth state or fragment token) but no active session → start one.
  if (!MOCK_MODE && params.token && !params.sessionId) {
    return (
      <div class="hud__error-overlay" style={{ flexDirection: 'column', gap: 16 }}>
        <div>Signed in. Start a new LOTO session?</div>
        <button
          class="hud__verify"
          disabled={startingSession}
          onClick={async () => {
            setStartingSession(true);
            try {
              const id = await startSession(apiHost, params.token);
              const url = new URL(window.location.href);
              url.searchParams.set('session', id);
              window.location.assign(url.toString());
            } catch (err) {
              setBootError(err instanceof Error ? err.message : String(err));
            } finally {
              setStartingSession(false);
            }
          }}
        >
          {startingSession ? 'Starting…' : 'Start LOTO session'}
        </button>
        <button
          onClick={() => {
            clearAuth();
            window.location.assign('/');
          }}
          style={{
            background: 'transparent',
            color: 'var(--ink-dim)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          sign out
        </button>
      </div>
    );
  }

  return (
    <StepCard
      state={state}
      elapsed={elapsed}
      onAdvance={() => void advanceStep()}
      onVerify={() => {
        /* photo capture happens on the companion (M7) */
      }}
      onPhoto={
        params.sessionId && params.token && state.currentStep !== undefined
          ? (file) => {
              // Show "Claude is reviewing…" instantly — the server's
              // verification_started event often dies with the WS while the
              // camera sheet has the page suspended.
              dispatch({ kind: 'photo-sent' });
              void uploadPhoto(
                params.apiHost,
                params.token,
                params.sessionId!,
                state.currentStep!,
                file,
              ).catch((err: unknown) => {
                const message = err instanceof Error ? err.message : String(err);
                dispatch({ kind: 'photo-failed', message: `${message} — tap PHOTO to retry` });
              });
            }
          : undefined
      }
    />
  );
}
