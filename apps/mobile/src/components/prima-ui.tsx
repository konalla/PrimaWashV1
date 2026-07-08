import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/design';

export function Surface({ children, accent = false }: PropsWithChildren<{ readonly accent?: boolean }>) {
  return <View style={[styles.surface, accent && styles.surfaceAccent]}>{children}</View>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, (disabled || loading) && styles.disabled]}>
      {loading ? <ActivityIndicator color={colors.onAction} /> : <Text style={styles.primaryLabel}>{label}</Text>}
    </Pressable>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  trailing,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly trailing?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {trailing}
    </View>
  );
}

export function StatusChip({
  children,
  tone = 'success',
}: PropsWithChildren<{ readonly tone?: 'success' | 'warning' | 'neutral' }>) {
  return (
    <View style={[styles.chip, tone === 'warning' && styles.chipWarning, tone === 'neutral' && styles.chipNeutral]}>
      <Text style={[styles.chipText, tone === 'warning' && styles.chipWarningText]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  surfaceAccent: { borderColor: colors.accent, backgroundColor: colors.surfaceStrong },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.action,
    paddingHorizontal: spacing.lg,
  },
  primaryLabel: { color: colors.onAction, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sectionCopy: { flex: 1 },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  sectionTitle: { color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: 0, marginTop: 3 },
  chip: { alignSelf: 'flex-start', borderRadius: radius.pill, backgroundColor: colors.surfaceStrong, paddingHorizontal: 10, paddingVertical: 6 },
  chipWarning: { backgroundColor: '#FFF2E8' },
  chipNeutral: { backgroundColor: colors.canvasRaised },
  chipText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  chipWarningText: { color: colors.warning },
});
