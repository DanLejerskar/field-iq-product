/** Compact style tokens shared by the screens. */
import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#0B1424',
  card: '#152033',
  ink: '#F5F1E8',
  inkDim: '#A6AFC2',
  field: '#E07B47',
  verified: '#10B981',
  retry: '#F0B23A',
  error: '#E0625C',
  border: '#2C3853',
};

export const screen = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 24 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700' },
  subtitle: { color: colors.inkDim, fontSize: 16, marginTop: 8 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  primaryButton: {
    backgroundColor: colors.field,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 16,
    marginTop: 8,
  },
});
