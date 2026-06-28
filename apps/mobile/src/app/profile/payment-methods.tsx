import { Alert, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, StatusChip, Surface } from '@/components/prima-ui';
import { SettingsScreen } from '@/components/settings-screen';
import { colors, spacing } from '@/constants/design';

export default function PaymentMethodsScreen() {
  return (
    <SettingsScreen title="Payment methods">
      <Surface accent>
        <View style={styles.row}>
          <View style={styles.cardMark}><Text style={styles.cardMarkText}>VISA</Text></View>
          <View style={styles.copy}>
            <Text style={styles.title}>•••• 4242</Text>
            <Text style={styles.body}>Expires 12/29</Text>
          </View>
          <StatusChip>Default</StatusChip>
        </View>
      </Surface>
      <Surface>
        <Text style={styles.title}>Protected checkout</Text>
        <Text style={styles.body}>
          Prima Wash authorizes your selected method when you book and captures payment only after service completion.
        </Text>
      </Surface>
      <PrimaryButton
        label="Add payment method"
        onPress={() =>
          Alert.alert(
            'Payment provider required',
            'Provider-hosted card entry will be enabled with the production payment integration.',
          )
        }
      />
      <Text style={styles.note}>Adding additional cards will be enabled with the production payment provider.</Text>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardMark: { width: 52, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#254A79' },
  cardMarkText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  copy: { flex: 1 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 3 },
  note: { color: colors.subtle, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
