import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton, Surface } from '@/components/prima-ui';
import { colors, radius, spacing } from '@/constants/design';
import { useAuth } from '@/context/auth-context';

export default function VerifyScreen() {
  const params = useLocalSearchParams<{
    challengeId: string;
    deliveryHint: string;
    devCode?: string;
  }>();
  const { verifyCode } = useAuth();
  const showDevAuthCode = process.env.EXPO_PUBLIC_SHOW_DEV_AUTH_CODE !== 'false';
  const visibleDevCode = showDevAuthCode ? params.devCode : undefined;
  const [code, setCode] = useState(visibleDevCode || '');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function verify() {
    setLoading(true);
    setError(undefined);

    try {
      await verifyCode(params.challengeId, code);
      router.replace('/profile/residence' as never);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The code could not be verified.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View>
        <Text style={styles.eyebrow}>SECURE SIGN IN</Text>
        <Text style={styles.title}>Enter your verification code</Text>
        <Text style={styles.body}>We sent a six-digit code to {params.deliveryHint}.</Text>
      </View>
      <Surface>
        <TextInput
          autoFocus
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={setCode}
          placeholder="000000"
          placeholderTextColor={colors.subtle}
          style={styles.code}
          textContentType="oneTimeCode"
          value={code}
        />
        {visibleDevCode ? <Text style={styles.dev}>Development code: {visibleDevCode}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton disabled={code.length !== 6} label="Verify and continue" loading={loading} onPress={verify} />
      </Surface>
      <Text onPress={() => router.back()} style={styles.back}>Use a different email or phone number</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', backgroundColor: colors.canvas, padding: spacing.xl, gap: spacing.xxl },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.6, marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: 0 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: spacing.md },
  code: { minHeight: 68, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.canvasRaised, color: colors.text, paddingHorizontal: spacing.lg, fontSize: 28, fontWeight: '800', letterSpacing: 10, textAlign: 'center' },
  dev: { color: colors.warning, fontSize: 11, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 12, textAlign: 'center' },
  back: { color: colors.accent, fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
