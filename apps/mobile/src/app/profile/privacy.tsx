import { Alert, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, Surface } from '@/components/prima-ui';
import { SettingsScreen } from '@/components/settings-screen';
import { colors, spacing } from '@/constants/design';
import { useAuth } from '@/context/auth-context';
import { useLocationPreference } from '@/context/location-context';

export default function PrivacyScreen() {
  const { logout, session } = useAuth();
  const { area, clearArea } = useLocationPreference();

  return (
    <SettingsScreen title="Privacy and security">
      <Surface accent>
        <Text style={styles.title}>Account security</Text>
        <Text style={styles.body}>Signed in as {session?.user.identifier}</Text>
        <Text style={styles.secure}>✓ Session protected on this device</Text>
      </Surface>
      <Surface>
        <SecurityItem label="Verification sign-in" value="Enabled" />
        <SecurityItem bordered label="Session expiry" value={session ? new Date(session.expiresAt).toLocaleString() : 'Unavailable'} />
        <SecurityItem bordered label="Secure native storage" value="Enabled" />
        <SecurityItem
          bordered
          label="Saved service area"
          value={area ? `${area.label} · stored only on this device` : 'Not saved'}
        />
      </Surface>
      {area ? <Text onPress={() => void clearArea()} style={styles.locationDelete}>Clear saved service area</Text> : null}
      <PrimaryButton label="Sign out of this device" onPress={logout} />
      <Text
        onPress={() =>
          Alert.alert(
            'Account deletion',
            'Self-service deletion will be enabled when the production identity and retention workflow is connected.',
          )
        }
        style={styles.delete}>
        Request account deletion
      </Text>
    </SettingsScreen>
  );
}

function SecurityItem({ label, value, bordered = false }: { readonly label: string; readonly value: string; readonly bordered?: boolean }) {
  return (
    <View style={[styles.item, bordered && styles.border]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  secure: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  item: { minHeight: 62, justifyContent: 'center', gap: 4 },
  border: { borderTopWidth: 1, borderTopColor: colors.border },
  label: { color: colors.text, fontSize: 14, fontWeight: '800' },
  value: { color: colors.muted, fontSize: 12 },
  delete: { color: colors.danger, fontSize: 13, fontWeight: '800', textAlign: 'center', padding: spacing.md },
  locationDelete: { color: colors.accent, fontSize: 13, fontWeight: '800', textAlign: 'center', padding: spacing.md },
});
