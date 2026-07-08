import type { CustomerProfile, ReferralSummary } from '@prima-wash/contracts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton, Surface } from '@/components/prima-ui';
import { colors, radius, spacing } from '@/constants/design';
import { useAuth } from '@/context/auth-context';
import { primaApi } from '@/lib/api';
import { formatMoney } from '@/lib/format';

const defaultReferralShareBaseUrl = 'https://primawash.app/invite';

export default function ProfileScreen() {
  const { logout, session } = useAuth();
  const [profile, setProfile] = useState<CustomerProfile>();
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [referrals, setReferrals] = useState<ReferralSummary>();
  const [referralCode, setReferralCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [claimingReferral, setClaimingReferral] = useState(false);

  useFocusEffect(
    useCallback(() => {
      primaApi.profile().then((next) => {
        setProfile(next);
        setDisplayName(next.displayName);
        setPhoneNumber(next.phoneNumber ?? '');
      }).catch((error) => Alert.alert('Profile unavailable', error instanceof Error ? error.message : 'Please try again.'));
      primaApi.referralSummary()
        .then(setReferrals)
        .catch((error) => Alert.alert('Referrals unavailable', error instanceof Error ? error.message : 'Please try again.'));
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

  async function shareReferral() {
    if (!referrals) {
      return;
    }

    const shareUrl = referrals.code.shareUrl ?? buildReferralShareUrl(referrals.code.code);
    await Share.share({
      title: 'Prima Wash invite',
      url: shareUrl,
      message: [
        'I thought you might like Prima Wash for your car care.',
        'You can book quality-checked vehicle care with upfront pricing, verified partners, and Prima Wash support on every booking.',
        `Use my invite code ${referrals.code.code} when you book:`,
        shareUrl,
      ].join('\n\n'),
    });
  }

  async function claimReferral() {
    setClaimingReferral(true);
    try {
      const summary = await primaApi.claimReferral(referralCode);
      setReferrals(summary);
      setReferralCode('');
      Alert.alert('Referral applied', 'Your account is linked to this invite code.');
    } catch (error) {
      Alert.alert('Referral not applied', error instanceof Error ? error.message : 'Please check the code and try again.');
    } finally {
      setClaimingReferral(false);
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
        <View style={styles.referralHeader}>
          <View style={styles.profileCopy}>
            <Text style={styles.eyebrow}>Invite rewards</Text>
            <Text style={styles.referralTitle}>Share Prima Wash</Text>
            <Text style={styles.detail}>Earn a rebate when a friend completes their first paid booking.</Text>
          </View>
          <View style={styles.creditPill}>
            <Text style={styles.creditAmount}>
              {referrals ? formatMoney(referrals.availableCreditTotal) : '...'}
            </Text>
            <Text style={styles.creditLabel}>available</Text>
          </View>
        </View>
        <View style={styles.referralCodeBox}>
          <Text style={styles.label}>Your invite code</Text>
          <Text style={styles.codeText}>{referrals?.code.code ?? 'Loading'}</Text>
        </View>
        <PrimaryButton label="Share invite" disabled={!referrals} onPress={shareReferral} />
        <View style={styles.claimBox}>
          <Field label="Have an invite code?" value={referralCode} onChangeText={setReferralCode} autoCapitalize="characters" placeholder="PW123456" />
          <PrimaryButton
            label="Apply code"
            disabled={referralCode.trim().length < 4}
            loading={claimingReferral}
            onPress={claimReferral}
          />
        </View>
        <Text style={styles.detail}>
          Pilot note: earned rebates are reviewed by Prima Wash and applied manually to your next booking.
        </Text>
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

function buildReferralShareUrl(code: string): string {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_REFERRAL_SHARE_BASE_URL?.trim() || defaultReferralShareBaseUrl;
  const separator = configuredBaseUrl.includes('?') ? '&' : '?';
  return `${configuredBaseUrl}${separator}ref=${encodeURIComponent(code)}`;
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
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.canvasRaised, color: colors.text, paddingHorizontal: spacing.lg, fontSize: 15 },
  referralHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  referralTitle: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 3 },
  creditPill: { minWidth: 98, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvasRaised, padding: spacing.md, alignItems: 'center' },
  creditAmount: { color: colors.accent, fontSize: 18, fontWeight: '900' },
  creditLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  referralCodeBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.canvasRaised, padding: spacing.lg, gap: spacing.xs },
  codeText: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: 1.2 },
  claimBox: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  setting: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  settingText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  arrow: { color: colors.subtle, fontSize: 25 },
  settingPressed: { opacity: 0.65 },
  version: { color: colors.subtle, textAlign: 'center', fontSize: 11 },
});
