import type { Booking, PartnerLocation, PaymentIntent } from '@prima-wash/contracts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { SectionHeading, StatusChip, Surface } from '@/components/prima-ui';
import { colors, spacing } from '@/constants/design';
import { useBooking } from '@/context/booking-context';
import { primaApi } from '@/lib/api';
import { formatAppointment, formatMoney, formatService } from '@/lib/format';

const milestoneLabels = ['Payment secured', 'Vehicle received', 'Care in progress', 'Ready'];

export default function BookingsScreen() {
  const { latestBooking } = useBooking();
  const [bookings, setBookings] = useState<readonly Booking[]>(latestBooking ? [latestBooking] : []);
  const [partners, setPartners] = useState<readonly PartnerLocation[]>([]);
  const [payments, setPayments] = useState<Readonly<Record<string, PaymentIntent | null>>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(undefined);
    try {
      const [nextBookings, nextPartners] = await Promise.all([primaApi.bookings(), primaApi.partners()]);
      setBookings(nextBookings);
      setPartners(nextPartners);
      const paymentEntries = await Promise.all(
        nextBookings.map(async (booking) => [booking.id, await primaApi.paymentForBooking(booking.id)] as const),
      );
      setPayments(Object.fromEntries(paymentEntries));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Bookings could not be refreshed.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <AppScreen eyebrow="Your care" title="Bookings">
      <SectionHeading title="Upcoming and active" trailing={<Text style={styles.count}>{bookings.length}</Text>} />
      {error ? (
        <Surface>
          <Text style={styles.emptyTitle}>Bookings could not be refreshed</Text>
          <Text style={styles.body}>{error}</Text>
          <Pressable onPress={() => void load()}><Text style={styles.refresh}>Try again</Text></Pressable>
        </Surface>
      ) : null}
      {bookings.length === 0 ? (
        <Surface>
          <Text style={styles.emptyTitle}>No bookings yet</Text>
          <Text style={styles.body}>Your next confirmed vehicle-care appointment will appear here.</Text>
        </Surface>
      ) : (
        bookings.map((booking) => {
          const payment = payments[booking.id];
          return (
          <Surface key={booking.id} accent={booking.status !== 'completed' && booking.status !== 'cancelled'}>
            <View style={styles.row}>
              <Text style={styles.eyebrow}>
                {partners.find((partner) => partner.id === booking.partnerLocationId)?.name.toUpperCase() ?? 'VERIFIED PARTNER'}
              </Text>
              <StatusChip tone={booking.status === 'cancelled' ? 'warning' : 'success'}>
                {customerStatusLabel(booking, payment)}
              </StatusChip>
            </View>
            <Text style={styles.title}>{formatService(booking.serviceCode)}</Text>
            <Text style={styles.body}>{formatAppointment(booking.scheduledStartAt)}</Text>
            <Text style={styles.price}>{formatMoney(booking.acceptedPrice)}</Text>
            {payment ? (
              <Text style={styles.paymentStatus}>{customerPaymentLine(booking, payment)}</Text>
            ) : null}
            {booking.status !== 'cancelled' ? <Milestones status={booking.status} /> : null}
            <Pressable onPress={() => router.push({ pathname: '/booking/detail', params: { bookingId: booking.id } })}>
              <Text style={styles.viewDetails}>View booking detail</Text>
            </Pressable>
            {booking.status === 'pending_payment' && payment?.status !== 'authorized' ? (
              <Pressable
                onPress={async () => {
                  try {
                    const nextPayment = payment ?? await primaApi.createPaymentIntent({ bookingId: booking.id });
                    const checkoutPath = `/booking/checkout?bookingId=${encodeURIComponent(booking.id)}&paymentIntentId=${encodeURIComponent(nextPayment.id)}`;
                    router.push(checkoutPath as never);
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : 'Checkout could not be opened.');
                  }
                }}>
                <Text style={styles.payNow}>Complete payment authorization</Text>
              </Pressable>
            ) : null}
            {['pending_payment', 'confirmed', 'checked_in'].includes(booking.status) ? (
              <Pressable
                onPress={() =>
                  Alert.alert('Cancel this booking?', 'Any authorized payment hold will be released.', [
                    { text: 'Keep booking', style: 'cancel' },
                    {
                      text: 'Cancel booking',
                      style: 'destructive',
                      onPress: async () => {
                        await primaApi.cancelBooking(booking.id);
                        await load();
                      },
                    },
                  ])
                }>
                <Text style={styles.cancel}>Cancel booking</Text>
              </Pressable>
            ) : null}
          </Surface>
        );
        })
      )}
      <Pressable disabled={refreshing} onPress={load}>
        <Text style={styles.refresh}>{refreshing ? 'Refreshing…' : 'Refresh bookings'}</Text>
      </Pressable>
    </AppScreen>
  );
}

function customerStatusLabel(booking: Booking, payment?: PaymentIntent | null) {
  if (booking.status === 'pending_payment' && payment?.status === 'authorized') {
    return 'Awaiting confirmation';
  }

  return booking.status.replaceAll('_', ' ');
}

function customerPaymentLine(booking: Booking, payment: PaymentIntent) {
  if (booking.status === 'pending_payment' && payment.status === 'authorized') {
    return 'Payment authorized · Partner confirmation next';
  }

  return `Payment ${payment.status.replaceAll('_', ' ')}`;
}

function Milestones({ status }: { readonly status: Booking['status'] }) {
  const activeIndex = {
    pending_payment: 0,
    confirmed: 0,
    checked_in: 1,
    in_service: 2,
    completed: 3,
    cancelled: -1,
  }[status];

  return (
    <View style={styles.timeline}>
      {milestoneLabels.map((label, index) => (
        <View key={label} style={styles.milestone}>
          <View style={[styles.dot, index <= activeIndex && styles.dotActive]} />
          <Text style={[styles.milestoneText, index <= activeIndex && styles.milestoneTextActive]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  count: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  price: { color: colors.text, fontSize: 18, fontWeight: '800' },
  paymentStatus: { color: colors.subtle, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  viewDetails: { color: colors.accent, fontSize: 13, fontWeight: '900', marginTop: spacing.sm },
  payNow: { color: colors.accent, fontSize: 13, fontWeight: '800', marginTop: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  timeline: { gap: 10, marginTop: spacing.sm },
  milestone: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent },
  milestoneText: { color: colors.subtle, fontSize: 12, fontWeight: '700' },
  milestoneTextActive: { color: colors.text },
  cancel: { color: colors.danger, fontSize: 13, fontWeight: '700', marginTop: spacing.sm },
  refresh: { color: colors.accent, fontSize: 13, fontWeight: '700', textAlign: 'center', padding: spacing.md },
});
