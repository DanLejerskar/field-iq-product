/**
 * Full-screen phone-companion shell. Top bar (procedure + step), 3D viewer
 * filling the remaining space, bottom bar with a status indicator.
 *
 * The integrator supplies `fetchScene(procedureId, stepNumber)`; this
 * component re-fetches whenever either changes, and feeds the resulting
 * SceneManifest into the wrapped Viewer.
 */
import type { SceneManifest } from '@field-iq/genesis-bridge';
import type { CreateElement, ViewerHooks } from './Viewer.js';
import type { PhoneSessionViewProps, ViewerProps } from './types.js';

export interface PhoneSessionViewHooks extends ViewerHooks {
  useState: <S>(initial: S | (() => S)) => [S, (next: S | ((prev: S) => S)) => void];
}

const COLOR = {
  navy: '#1E2761',
  deepNavy: '#0B1424',
  ice: '#CADCFC',
  cream: '#F5F1EA',
  accent: '#B85042',
} as const;

const TOP_BAR_HEIGHT = 56;
const BOTTOM_BAR_HEIGHT = 40;

interface LoadStatus {
  state: 'idle' | 'loading' | 'ready' | 'error' | 'empty';
  message?: string;
}

function indicatorStyle(state: LoadStatus['state']): Record<string, unknown> {
  const color =
    state === 'error'
      ? COLOR.accent
      : state === 'loading'
        ? COLOR.ice
        : state === 'empty'
          ? COLOR.cream
          : '#10B981';
  return {
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: color,
    marginRight: 8,
  };
}

export function createPhoneSessionViewComponent<E>(
  create: CreateElement<E>,
  hooks: PhoneSessionViewHooks,
  ViewerComponent: (props: ViewerProps) => E,
): (props: PhoneSessionViewProps) => E {
  return function PhoneSessionView(props: PhoneSessionViewProps): E {
    const [scene, setScene] = hooks.useState<SceneManifest | null>(null);
    const [status, setStatus] = hooks.useState<LoadStatus>({ state: 'idle' });

    hooks.useEffect(() => {
      let cancelled = false;
      setStatus({ state: 'loading' });
      props
        .fetchScene(props.procedureId, props.currentStepNumber)
        .then((m) => {
          if (cancelled) return;
          if (!m) {
            setScene(null);
            setStatus({
              state: 'empty',
              message: `No 3D scene for step ${props.currentStepNumber}.`,
            });
            return;
          }
          setScene(m);
          setStatus({ state: 'ready', message: m.sceneId });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setStatus({
            state: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        });
      return () => {
        cancelled = true;
      };
    }, [props.procedureId, props.currentStepNumber, props.fetchScene]);

    const topBar = create(
      'header',
      {
        style: {
          height: TOP_BAR_HEIGHT,
          background: COLOR.navy,
          color: COLOR.cream,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: 0.4,
          fontFamily: 'Inter, system-ui, sans-serif',
        },
      },
      `${props.procedureId} · Step ${props.currentStepNumber}`,
    );

    const viewerSlot = create(
      'div',
      {
        style: {
          flex: '1 1 auto',
          minHeight: 0,
          position: 'relative',
          background: '#0B1F4D',
        },
      },
      scene
        ? ViewerComponent({ scene })
        : create(
            'div',
            {
              style: {
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: COLOR.ice,
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 13,
              },
            },
            status.state === 'loading'
              ? 'Loading 3D scene…'
              : status.state === 'empty'
                ? (status.message ?? 'No scene for this step.')
                : status.state === 'error'
                  ? `Could not load scene: ${status.message ?? ''}`
                  : '',
          ),
    );

    const bottomBar = create(
      'footer',
      {
        style: {
          height: BOTTOM_BAR_HEIGHT,
          background: COLOR.deepNavy,
          color: COLOR.ice,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          fontSize: 12,
          fontFamily: 'Inter, system-ui, sans-serif',
        },
      },
      create('span', { style: indicatorStyle(status.state) }),
      create(
        'span',
        {},
        status.state === 'ready'
          ? `Scene · ${status.message ?? 'ready'}`
          : status.state === 'loading'
            ? 'Loading…'
            : status.state === 'empty'
              ? 'No scene'
              : status.state === 'error'
                ? 'Error'
                : 'Idle',
      ),
    );

    return create(
      'section',
      {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: COLOR.deepNavy,
        },
        'aria-label': `Phone companion for session ${props.sessionId}`,
      },
      topBar,
      viewerSlot,
      bottomBar,
    );
  };
}
