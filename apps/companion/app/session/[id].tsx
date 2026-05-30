import NetInfo from '@react-native-community/netinfo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { MetaGlasses } from '@/native';
import { connect, type WsClient } from '@/api/ws';
import { api, env, uploadQueue, useMirror } from '@/state/stores';
import { useAuth } from '@/state/stores';
import { screen, colors } from '@/styles';

const CARD_COLOR: Record<string, string> = {
  pending: colors.field,
  processing: colors.field,
  verified: colors.verified,
  retry: colors.retry,
  error: colors.error,
  complete: colors.verified,
  paused: colors.inkDim,
};

/**
 * Live session mirror. Hydrates from REST, opens the WebSocket, and drives
 * photo capture + upload (with offline queue fallback) for the current step.
 */
export default function SessionScreen() {
  const router = useRouter();
  const { id: sessionIdParam } = useLocalSearchParams<{ id: string }>();
  const sessionId = String(sessionIdParam ?? '');
  const principal = useAuth((s) => s.principal);
  const { state, dispatch, reset } = useMirror((s) => s);
  const [steps, setSteps] = useState<
    Array<{ stepNumber: number; title: string; instruction: string }>
  >([]);

  // Hydrate + open WS.
  useEffect(() => {
    if (!sessionId || !principal) return;
    let client: WsClient | undefined;
    let alive = true;
    api
      .getSession(sessionId)
      .then((s) => {
        if (!alive) return;
        setSteps(s.steps);
        dispatch({
          kind: 'hydrate',
          sessionId,
          currentStep: s.state.currentStepNumber,
          totalSteps: s.steps.length,
        });
      })
      .catch((err: unknown) => Alert.alert('Could not load session', String(err)));

    client = connect(env.wsHost, principal.jwt, {
      sessionId,
      getLastEventId: () => state.lastEventId,
      onConnection: (status) => dispatch({ kind: 'connection', status }),
      onEvent: (e) => dispatch({ kind: 'event', event: e }),
    });

    return () => {
      alive = false;
      client?.close();
      reset();
    };
  }, [sessionId, principal?.jwt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drain queue when network returns.
  useEffect(() => {
    return NetInfo.addEventListener((s) => {
      if (s.isConnected) {
        void uploadQueue.drain(async (job) => {
          await api.verifyPhoto(job.sessionId, {
            stepNumber: job.stepNumber,
            photoBase64: job.photoBase64,
            lat: job.lat,
            lng: job.lng,
          });
        });
      }
    });
  }, []);

  const currentStep = useMemo(
    () => steps.find((s) => s.stepNumber === state.currentStep),
    [steps, state.currentStep],
  );

  async function takePhoto() {
    if (!state.sessionId || !state.currentStep) return;
    try {
      const photo = await MetaGlasses.capturePhoto();
      const job = {
        id: `${state.sessionId}-${state.currentStep}-${Date.now()}`,
        sessionId: state.sessionId,
        stepNumber: state.currentStep,
        photoBase64: photo.base64,
        capturedAt: photo.capturedAt,
      };
      uploadQueue.enqueue(job);
      // Try inline upload; on failure the queue retains it for NetInfo.
      try {
        await api.verifyPhoto(job.sessionId, {
          stepNumber: job.stepNumber,
          photoBase64: job.photoBase64,
        });
        await uploadQueue.drain(async (j) => {
          await api.verifyPhoto(j.sessionId, {
            stepNumber: j.stepNumber,
            photoBase64: j.photoBase64,
          });
        });
      } catch {
        /* queue will retry on reconnect */
      }
    } catch (err) {
      Alert.alert('Capture failed', String(err));
    }
  }

  async function advance() {
    if (!state.sessionId) return;
    try {
      await api.advance(state.sessionId);
    } catch (err) {
      Alert.alert('Advance failed', String(err));
    }
  }

  async function complete() {
    if (!state.sessionId) return;
    try {
      await api.complete(state.sessionId);
      router.replace('/session/complete');
    } catch (err) {
      Alert.alert('Complete failed', String(err));
    }
  }

  return (
    <View style={screen.root}>
      <Text style={screen.subtitle}>
        STEP {state.currentStep ?? '-'} / {state.totalSteps} · {state.connection}
      </Text>
      <View style={[screen.card, { borderColor: CARD_COLOR[state.cardState] }]}>
        <Text style={screen.title}>{currentStep?.title ?? '—'}</Text>
        {currentStep ? (
          <Text style={[screen.subtitle, { marginTop: 12 }]}>{currentStep.instruction}</Text>
        ) : null}
        {state.message ? (
          <Text style={[screen.subtitle, { color: CARD_COLOR[state.cardState], marginTop: 12 }]}>
            {state.message}
          </Text>
        ) : null}
      </View>

      {state.cardState === 'verified' && state.currentStep === state.totalSteps ? (
        <TouchableOpacity style={screen.primaryButton} onPress={complete}>
          <Text style={screen.primaryButtonText}>Finish procedure</Text>
        </TouchableOpacity>
      ) : state.cardState === 'verified' ? (
        <TouchableOpacity style={screen.primaryButton} onPress={advance}>
          <Text style={screen.primaryButtonText}>Continue to next step</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={screen.primaryButton}
          onPress={takePhoto}
          disabled={state.cardState === 'processing'}
        >
          <Text style={screen.primaryButtonText}>
            {state.cardState === 'processing' ? 'Verifying…' : 'Take verification photo'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
