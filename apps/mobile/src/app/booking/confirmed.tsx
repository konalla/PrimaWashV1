import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton, StatusChip, Surface } from '@/components/prima-ui';
import { colors, radius, spacing } from '@/constants/design';
import { useBooking } from '@/context/booking-context';
import { useNotifications } from '@/context/notification-context';
import { formatAppointment, formatMoney, formatService } from '@/lib/format';

export default function ConfirmedScreen() {
  const { draft, latestBooking, latestPayment, reset } = useBooking();
  const { lastScheduleResult } = useNotifications();

  return (
    <AppScreen>
      <View style={styles.hero}>
        <View style={styles.check}><Text style={styles.checkText}>OK</Text></View>
        <Text style={styles.eyebrow}>PAYMENT AUTHORIZED</Text>
        <Text style={styles.title}>Your appointment is secured.</Text>
        <Text style={styles.body}>
          {draft.partner?.name ?? 'Your selected partner'} has received your request. Partner confirmation is next.
        </Text>
      </View>
      {latestBooking ? (
        <View style={styles.bookingCard}>
          <View style={styles.row}>
            <Text style={styles.service}>{formatService(latestBooking.serviceCode)}</Text>
            <StatusChip>{latestPayment?.status === 'authorized' ? 'authorized' : latestPayment?.status ?? 'authorized'}</StatusChip>
          </View>
          <Text style={styles.appointment}>{formatAppointment(latestBooking.scheduledStartAt)}</Text>
          <Text style={styles.price}>{formatMoney(latestBooking.acceptedPrice)}</Text>
          <Text style={styles.reference}>Reference {latestBooking.id.slice(-8).toUpperCase()}</Text>
        </View>
      ) : null}
      {lastScheduleResult ? (
        <Surface>
          <Text style={styles.reminderTitle}>Reminder status</Text>
          <Text style={styles.body}>{lastScheduleResult.message}</Text>
        </Surface>
      ) : null}
      <PrimaryButton label="Track this booking" onPress={() => router.replace('/(tabs)/bookings')} />
      <Text
        onPress={() => {
          reset();
          router.replace('/(tabs)/home');
        }}
        style={styles.home}>
        Return home
      </Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.md },
  check: {
    width: 76,
    height: 76,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accentStrong,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  checkText: { color: colors.onAccent, fontSize: 18, fontWeight: '900' },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: 0, textAlign: 'center' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  bookingCard: { borderWidth: 1, borderColor: '#C7D6D2', borderRadius: radius.xl, backgroundColor: colors.surfaceStrong, padding: spacing.xl, gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  service: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '800' },
  appointment: { color: colors.muted, fontSize: 14 },
  price: { color: colors.accent, fontSize: 28, fontWeight: '900' },
  reference: { color: colors.subtle, fontSize: 11, letterSpacing: 1 },
  reminderTitle: { color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  home: { color: colors.accent, fontSize: 14, fontWeight: '700', textAlign: 'center', padding: spacing.md },
});
