import type { CustomerProfile } from '@prima-wash/contracts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton, Surface } from '@/components/prima-ui';
import { colors, radius, spacing } from '@/constants/design';
import { useAuth } from '@/context/auth-context';
import { primaApi } from '@/lib/api';

export default function ProfileScreen() {
  const { logout, session } = useAuth();
  const [profile, setProfile] = useState<CustomerProfile>();
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      primaApi.profile().then((next) => {
        setProfile(next);
        setDisplayName(next.displayName);
        setPhoneNumber(next.phoneNumber ?? '');
      }).catch((error) => Alert.alert('Profile unavailable', error instanceof Error ? error.message : 'Please try again.'));
    }, []),
  );

  async function save() {
    setSaving(true);
    try {
      const updated = await primaApi.updateProfile({ displayName, phoneNumber });
      setProfile(updated);
      Alert.alert('Profile updated');
    } catch (error) {
      Alert.alert('Profile could not be updated', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const name = profile?.displayName ?? session?.user.displayName ?? 'Vehicle owner';

  return (
    <AppScreen eyebrow="Account" title="Profile">
      <Surface accent>
        <View style={styles.profile}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>
          <View style={styles.profileCopy}><Text style={styles.name}>{name}</Text><Text style={styles.detail}>{profile?.identifier ?? session?.user.identifier}</Text></View>
        </View>
      </Surface>
      <Surface>
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} />
        <Field label="Phone number" value={phoneNumber} onChangeText={setPhoneNumber} keyboardType="phone-pad" placeholder="+1 202 555 0123" />
        <PrimaryButton label="Save profile" loading={saving} onPress={save} />
      </Surface>
      <Surface>
        <Setting label="Residence setup" onPress={() => router.push('/profile/residence' as never)} />
        <Setting label="Payment methods" onPress={() => router.push('/profile/payment-methods')} />
        <Setting label="Payment history" bordered onPress={() => router.push('/profile/payment-history' as never)} />
        <Setting label="Notifications" bordered onPress={() => router.push('/profile/notifications')} />
        <Setting label="Help and support" bordered onPress={() => router.push('/profile/help')} />
        <Setting label="Privacy and security" bordered onPress={() => router.push('/profile/privacy')} />
      </Surface>
      <PrimaryButton label="Sign out" onPress={logout} />
      <Text style={styles.version}>Prima Wash mobile · Phase 1</Text>
    </AppScreen>
  );
}

function Field({ label, ...props }: { readonly label: string } & React.ComponentProps<typeof TextInput>) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor={colors.subtle} style={styles.input} {...props} /></View>;
}

function Setting({
  label,
  bordered = false,
  onPress,
}: {
  readonly label: string;
  readonly bordered?: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint={`Opens ${label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.setting, bordered && styles.settingBorder, pressed && styles.settingPressed]}>
      <Text style={styles.settingText}>{label}</Text>
      <Text style={styles.arrow}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  profileCopy: { flex: 1 },
  avatar: { width: 60, height: 60, borderRadius: radius.lg, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.black, fontSize: 23, fontWeight: '900' },
  name: { color: colors.text, fontSize: 21, fontWeight: '800' },
  detail: { color: colors.muted, fontSize: 13, marginTop: 4 },
  field: { gap: spacing.sm },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.canvasRaised, color: colors.text, paddingHorizontal: spacing.lg, fontSize: 15 },
  setting: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  settingText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  arrow: { color: colors.subtle, fontSize: 25 },
  settingPressed: { opacity: 0.65 },
  version: { color: colors.subtle, textAlign: 'center', fontSize: 11 },
});
