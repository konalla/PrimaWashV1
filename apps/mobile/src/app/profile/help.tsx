import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Surface } from '@/components/prima-ui';
import { SettingsScreen } from '@/components/settings-screen';
import { colors, spacing } from '@/constants/design';

const questions = [
  ['When is payment captured?', 'Your card is authorized when you book and captured after the service is completed.'],
  ['Can I cancel a booking?', 'Yes. You can cancel before vehicle check-in, subject to the policy shown at checkout.'],
  ['How are partners verified?', 'Partners are reviewed for identity, service standards, operating capacity, and customer outcomes.'],
] as const;

export default function HelpScreen() {
  return (
    <SettingsScreen title="Help and support">
      <Surface accent>
        <Text style={styles.title}>How can we help?</Text>
        <Text style={styles.body}>Contact the Prima Care team for booking, payment, or service assistance.</Text>
        <Pressable accessibilityRole="button" onPress={() => void Linking.openURL('mailto:support@primawash.com')}>
          <Text style={styles.link}>Email support@primawash.com</Text>
        </Pressable>
      </Surface>
      <Text style={styles.eyebrow}>FREQUENTLY ASKED</Text>
      {questions.map(([question, answer]) => (
        <Surface key={question}>
          <Text style={styles.question}>{question}</Text>
          <Text style={styles.body}>{answer}</Text>
        </Surface>
      ))}
      <View style={styles.emergency}>
        <Text style={styles.body}>For an active appointment issue, include your booking reference when contacting support.</Text>
      </View>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 21, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  link: { color: colors.accent, fontSize: 14, fontWeight: '800', paddingVertical: spacing.sm },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  question: { color: colors.text, fontSize: 15, fontWeight: '800' },
  emergency: { paddingHorizontal: spacing.md },
});
