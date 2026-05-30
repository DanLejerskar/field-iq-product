import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/state/stores';
import { screen, colors } from '@/styles';

/**
 * Scans the equipment QR via the phone camera (the DAT SDK photo path is reserved
 * for the per-step verification flow). Resolves the QR through the backend and
 * jumps into the session mirror.
 */
export default function Scan() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);

  if (!permission) return <View style={screen.root} />;
  if (!permission.granted) {
    return (
      <View style={screen.root}>
        <Text style={screen.title}>Camera access</Text>
        <Text style={screen.subtitle}>We need the camera to scan the equipment QR.</Text>
        <TouchableOpacity style={screen.primaryButton} onPress={requestPermission}>
          <Text style={screen.primaryButtonText}>Grant access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[screen.root, { padding: 0 }]}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={
          busy
            ? undefined
            : async ({ data }) => {
                setBusy(true);
                try {
                  const { equipment, activeProcedure } = await api.resolveQr(data);
                  if (!activeProcedure) throw new Error('No active procedure for this equipment');
                  const { sessionId } = await api.createSession(equipment.id, activeProcedure.id);
                  router.replace(`/session/${sessionId}`);
                } catch (err) {
                  Alert.alert('Scan failed', String(err));
                  setBusy(false);
                }
              }
        }
      />
      <View
        style={{
          padding: 24,
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        }}
      >
        <Text style={screen.subtitle}>Frame the QR on the DAC #811 baseplate.</Text>
      </View>
    </View>
  );
}
