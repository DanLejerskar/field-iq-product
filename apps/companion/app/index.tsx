import { Redirect, Link, useRouter } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useState } from 'react';
import { MetaGlasses, type PairedDevice } from '@/native';
import { useAuth, uploadQueue } from '@/state/stores';
import { screen } from '@/styles';

export default function Home() {
  const principal = useAuth((s) => s.principal);
  const router = useRouter();
  const [device, setDevice] = useState<PairedDevice | null>(null);
  const [pending, setPending] = useState(uploadQueue.size());

  useEffect(() => {
    void MetaGlasses.getPairedDevice().then(setDevice);
    const id = setInterval(() => setPending(uploadQueue.size()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!principal) return <Redirect href="/login" />;

  return (
    <View style={screen.root}>
      <Text style={screen.title}>EON Field IQ</Text>
      <Text style={screen.subtitle}>Signed in as {principal.fullName}</Text>

      <View style={screen.card}>
        <Text style={[screen.title, { fontSize: 20 }]}>Glasses</Text>
        <Text style={screen.subtitle}>
          {device ? `${device.serial} (${device.batteryPercent}%)` : 'No device paired'}
        </Text>
        <Link href="/pair" asChild>
          <TouchableOpacity style={screen.primaryButton}>
            <Text style={screen.primaryButtonText}>{device ? 'Re-pair' : 'Pair device'}</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <TouchableOpacity style={screen.primaryButton} onPress={() => router.push('/scan')}>
        <Text style={screen.primaryButtonText}>Start procedure</Text>
      </TouchableOpacity>

      {pending > 0 ? (
        <Text style={[screen.subtitle, { marginTop: 16 }]}>
          {pending} photo(s) queued for upload — will drain when network returns.
        </Text>
      ) : null}
    </View>
  );
}
