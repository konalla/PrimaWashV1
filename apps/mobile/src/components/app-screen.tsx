import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/constants/design';

interface AppScreenProps extends PropsWithChildren {
  readonly title?: string;
  readonly eyebrow?: string;
  readonly trailing?: ReactNode;
  readonly scroll?: boolean;
}

export function AppScreen({ children, title, eyebrow, trailing, scroll = true }: AppScreenProps) {
  const content = (
    <>
      {title ? (
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
            <Text style={styles.title}>{title}</Text>
          </View>
          {trailing}
        </View>
      ) : null}
      {children}
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        <View style={styles.content}>{content}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.xl, paddingBottom: 120, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headerCopy: { flex: 1 },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -1.1 },
});
