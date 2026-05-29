import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, useAuth } from '@/state/stores';
import { screen } from '@/styles';

/**
 * Two-stage magic-link flow:
 *  1. Email → POST /api/auth/magic-link/request (backend logs the link in dev).
 *  2. The link deep-links back here as `/login?token=...`; we POST it to
 *     /verify and stash the principal.
 */
export default function Login() {
  const router = useRouter();
  const setPrincipal = useAuth((s) => s.setPrincipal);
  const params = useLocalSearchParams<{ token?: string }>();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = typeof params.token === 'string' ? params.token : undefined;
    if (!token) return;
    setBusy(true);
    api
      .verifyMagicLink(token)
      .then((res) => {
        setPrincipal({
          jwt: res.jwt,
          userId: res.user.id,
          orgId: res.org.id,
          email: res.user.email,
          fullName: res.user.fullName,
          role: res.user.role,
        });
        router.replace('/');
      })
      .catch((err: unknown) => Alert.alert('Sign-in failed', String(err)))
      .finally(() => setBusy(false));
  }, [params.token, router, setPrincipal]);

  return (
    <View style={screen.root}>
      <Text style={screen.title}>Sign in</Text>
      <Text style={screen.subtitle}>We'll email you a one-time link.</Text>
      <TextInput
        style={screen.input}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        placeholder="you@eonreality.com"
        placeholderTextColor="#6B7689"
      />
      <TouchableOpacity
        style={screen.primaryButton}
        disabled={busy || !email}
        onPress={() => {
          setBusy(true);
          api
            .requestMagicLink(email)
            .then(() => Alert.alert('Check your email', 'We sent a sign-in link.'))
            .catch((err: unknown) => Alert.alert('Could not send', String(err)))
            .finally(() => setBusy(false));
        }}
      >
        <Text style={screen.primaryButtonText}>{busy ? 'Sending…' : 'Email me a link'}</Text>
      </TouchableOpacity>
    </View>
  );
}
