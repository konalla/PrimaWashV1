import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton, Surface } from '@/components/prima-ui';
import { colors, radius, spacing } from '@/constants/design';
import { useAuth } from '@/context/auth-context';

export default function LoginScreen() {
  const { requestCode } = useAuth();
  const [identifier, setIdentifier] = useState('nalla@example.com');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function continueToCode() {
    setLoading(true);
    setError(undefined);

    try {
      const challenge = await requestCode(identifier);
      router.push({
        pathname: '/auth/verify',
        params: {
          challengeId: challenge.challengeId,
          deliveryHint: challenge.deliveryHint,
          devCode: challenge.devCode ?? '',
        },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send a verification code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.brandMark}><Text style={styles.brandLetter}>P</Text></View>
      <Text style={styles.eyebrow}>PRIMA WASH</Text>
      <Text style={styles.title}>Your vehicle care, in one trusted place.</Text>
      <Text style={styles.body}>Sign in to book care, manage your garage, and follow every appointment.</Text>
      <Surface>
        <Text style={styles.label}>Email or phone number</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setIdentifier}
          placeholder="you@example.com"
          placeholderTextColor={colors.subtle}
          style={styles.input}
          value={identifier}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton label="Continue securely" loading={loading} onPress={continueToCode} />
      </Surface>
      <Text style={styles.legal}>By continuing, you agree to Prima Wash’s terms and privacy policy.</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', backgroundColor: colors.canvas, padding: spacing.xl, gap: spacing.lg },
  brandMark: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  brandLetter: { color: colors.black, fontSize: 23, fontWeight: '900' },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: colors.text, fontSize: 36, lineHeight: 41, fontWeight: '900', letterSpacing: -1.4 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.canvasRaised, color: colors.text, paddingHorizontal: spacing.lg, fontSize: 16 },
  error: { color: colors.danger, fontSize: 12 },
  legal: { color: colors.subtle, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
