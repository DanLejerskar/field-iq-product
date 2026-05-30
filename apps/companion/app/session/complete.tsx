import { useRouter } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';
import { screen } from '@/styles';

export default function Complete() {
  const router = useRouter();
  return (
    <View style={screen.root}>
      <Text style={screen.title}>🏁 Procedure complete</Text>
      <Text style={screen.subtitle}>
        The signed PDF audit report has been queued. Your trainer can download it from the
        dashboard.
      </Text>
      <TouchableOpacity style={screen.primaryButton} onPress={() => router.replace('/')}>
        <Text style={screen.primaryButtonText}>Back to home</Text>
      </TouchableOpacity>
    </View>
  );
}
