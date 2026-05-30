import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { MetaGlasses, type ConnectionStatus } from '@/native';
import { screen } from '@/styles';

export default function Pair() {
  const router = useRouter();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [busy, setBusy] = useState(false);

  useEffect(() => MetaGlasses.onConnectionChange(setStatus), []);

  return (
    <View style={screen.root}>
      <Text style={screen.title}>Pair glasses</Text>
      <Text style={screen.subtitle}>
        Put on the Meta Ray-Ban Display and the Neural Band, then tap pair.
      </Text>
      <View style={screen.card}>
        <Text style={[screen.subtitle, { fontSize: 18 }]}>Connection: {status}</Text>
      </View>
      <TouchableOpacity
        style={screen.primaryButton}
        disabled={busy}
        onPress={() => {
          setBusy(true);
          MetaGlasses.pairDevice()
            .then(() => router.back())
            .catch((err: unknown) => Alert.alert('Pairing failed', String(err)))
            .finally(() => setBusy(false));
        }}
      >
        <Text style={screen.primaryButtonText}>{busy ? 'Pairing…' : 'Pair device'}</Text>
      </TouchableOpacity>
    </View>
  );
}
