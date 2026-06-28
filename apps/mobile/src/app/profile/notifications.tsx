import { useEffect } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Surface } from '@/components/prima-ui';
import { SettingsScreen } from '@/components/settings-screen';
import { colors, spacing } from '@/constants/design';
import { useNotifications } from '@/context/notification-context';

export default function NotificationsScreen() {
  const {
    preferences,
    loading,
    supported,
    permission,
    setPreference,
    refreshPermission,
    requestPermission,
  } = useNotifications();

  useEffect(() => {
    void refreshPermission();
  }, [refreshPermission]);

  return (
    <SettingsScreen title="Notifications">
      <Surface accent>
        <Text style={styles.statusLabel}>DEVICE STATUS</Text>
        <Text style={styles.statusTitle}>
          {supported ? formatPermission(permission) : 'Unavailable in web preview'}
        </Text>
        <Text style={styles.statusBody}>
          {supported
            ? 'Prima Wash can schedule local booking confirmations and appointment reminders on this device.'
            : 'Web preview cannot schedule device notifications. These controls still persist and will apply on iOS or Android builds.'}
        </Text>
        {supported && permission !== 'granted' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void requestPermission()}
            style={({ pressed }) => [styles.permissionButton, pressed && styles.pressed]}>
            <Text style={styles.permissionLabel}>Allow notifications</Text>
          </Pressable>
        ) : null}
      </Surface>

      <Surface>
        <Preference
          description="Confirmation alerts and important changes after a booking is created."
          disabled={loading}
          label="Booking confirmations"
          onValueChange={(value) => void setPreference('bookingUpdates', value)}
          value={preferences.bookingUpdates}
        />
        <Preference
          bordered
          description="A local reminder before your scheduled appointment time."
          disabled={loading}
          label="Appointment reminders"
          onValueChange={(value) => void setPreference('appointmentReminders', value)}
          value={preferences.appointmentReminders}
        />
        <Preference
          bordered
          description="Partner check-in, progress, and ready-for-pickup updates."
          disabled={loading}
          label="Partner status updates"
          onValueChange={(value) => void setPreference('partnerUpdates', value)}
          value={preferences.partnerUpdates}
        />
        <Preference
          bordered
          description="Relevant membership benefits and partner offers. Off by default."
          disabled={loading}
          label="Offers and benefits"
          onValueChange={(value) => void setPreference('offers', value)}
          value={preferences.offers}
        />
        <Preference
          bordered
          description="Send payment and service receipts to your account email."
          disabled={loading}
          label="Email receipts"
          onValueChange={(value) => void setPreference('emailReceipts', value)}
          value={preferences.emailReceipts}
        />
      </Surface>

      <Text style={styles.note}>
        Preferences are saved on this device. Production push, SMS, and email delivery will connect after backend notification channels are added.
      </Text>
    </SettingsScreen>
  );
}

function Preference({
  label,
  description,
  value,
  onValueChange,
  bordered = false,
  disabled = false,
}: {
  readonly label: string;
  readonly description: string;
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
  readonly bordered?: boolean;
  readonly disabled?: boolean;
}) {
  return (
    <View style={[styles.preference, bordered && styles.border]}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={onValueChange}
        thumbColor={value ? colors.black : colors.muted}
        trackColor={{ false: colors.border, true: colors.accent }}
        value={value}
      />
    </View>
  );
}

function formatPermission(permission: 'granted' | 'denied' | 'undetermined') {
  if (permission === 'granted') {
    return 'Notifications allowed';
  }

  if (permission === 'denied') {
    return 'Notifications blocked';
  }

  return 'Permission not requested';
}

const styles = StyleSheet.create({
  statusLabel: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  statusTitle: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: 0 },
  statusBody: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  permissionButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  permissionLabel: { color: colors.black, fontSize: 13, fontWeight: '900' },
  preference: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  border: { borderTopWidth: 1, borderTopColor: colors.border },
  copy: { flex: 1 },
  label: { color: colors.text, fontSize: 15, fontWeight: '800' },
  description: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  note: { color: colors.subtle, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  pressed: { opacity: 0.76 },
});
