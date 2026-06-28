import { router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { colors, radius } from '@/constants/design';

export function SettingsScreen({
  title,
  eyebrow = 'Profile',
  children,
}: PropsWithChildren<{ readonly title: string; readonly eyebrow?: string }>) {
  return (
    <AppScreen
      eyebrow={eyebrow}
      title={title}
      trailing={
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      }>
      {children}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  backText: { color: colors.text, fontSize: 30, lineHeight: 34 },
  pressed: { opacity: 0.65 },
});
