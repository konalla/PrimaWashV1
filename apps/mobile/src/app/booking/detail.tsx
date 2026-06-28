import type { Booking, PartnerLocation, PaymentIntent, Vehicle } from '@prima-wash/contracts';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton, SectionHeading, StatusChip, Surface } from '@/components/prima-ui';
import { colors, spacing } from '@/constants/design';
import { primaApi } from '@/lib/api';
import { formatAppointment, formatMoney, formatService } from '@/lib/format';
import { openDirections } from '@/lib/location';

const statusCopy: Record<Booking['status'], { readonly label: string; readonly body: string }> = {
  pending_payment: {
    label: 'Awaiting payment authorization',
    body: 'Authorize payment to secure this appointment. The hold is captured only after care is completed.',
  },
  confirmed: {
    label: 'Confirmed',
    body: 'The partner has the appointment and is ready for your arrival.',
  },
  checked_in: {
    label: 'Vehicle checked in',
    body: 'Your vehicle has been received by the partner.',
  },
  in_service: {
    label: 'Care in progress',
    body: 'The selected service is underway.',
  },
  completed: {
    label: 'Completed',
    body: 'Vehicle care is complete. Payment capture and service record are finalized by the platform.',
  },
  cancelled: {
    label: 'Cancelled',
    body: 'This booking is cancelled. Any authorized payment hold should be released.',
  },
};

const authorizedPendingStatus = {
  label: 'Awaiting partner confirmation',
  body: 'Payment is authorized. The partner now needs to confirm the appointment before arrival.',
};

const timeline: readonly { readonly status: Booking['status']; readonly label: string; readonly body: string }[] = [
  { status: 'pending_payment', label: 'Payment secured', body: 'Payment authorization is ready for partner confirmation.' },
  { status: 'confirmed', label: 'Confirmed', body: 'Payment authorized and partner confirmed.' },
  { status: 'checked_in', label: 'Checked in', body: 'Vehicle received at partner location.' },
  { status: 'in_service', label: 'In service', body: 'Care work is in progress.' },
  { status: 'completed', label: 'Completed', body: 'Service complete and payment captured.' },
];

export default function BookingDetailScreen() {
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const bookingId = Array.isArray(params.bookingId) ? params.bookingId[0] : params.bookingId;
  const [booking, setBooking] = useState<Booking>();
  const [payment, setPayment] = useState<PaymentIntent | null>();
  const [partner, setPartner] = useState<PartnerLocation>();
  const [vehicle, setVehicle] = useState<Vehicle>();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!bookingId) {
      setError('Booking reference is missing.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      const nextBooking = await primaApi.booking(bookingId);
      const [nextPayment, nextPartner, vehicles] = await Promise.all([
        primaApi.paymentForBooking(nextBooking.id),
        primaApi.partner(nextBooking.partnerLocationId),
        primaApi.vehicles(),
      ]);

      setBooking(nextBooking);
      setPayment(nextPayment);
      setPartner(nextPartner);
      setVehicle(vehicles.find((item) => item.id === nextBooking.vehicleId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Booking could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const status = booking ? getStatusCopy(booking, payment) : undefined;
  const canCancel = booking ? ['pending_payment', 'confirmed', 'checked_in'].includes(booking.status) : false;
  const needsPayment = booking?.status === 'pending_payment' && payment?.status !== 'authorized';
  const activeIndex = useMemo(() => (booking ? timeline.findIndex((item) => item.status === booking.status) : -1), [booking]);

  async function authorizePayment() {
    if (!booking) {
      return;
    }

    setActionLoading(true);
    setError(undefined);

    try {
      const nextPayment = payment ?? await primaApi.createPaymentIntent({ bookingId: booking.id });
      await primaApi.authorizePayment(nextPayment.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Payment could not be authorized.');
    } finally {
      setActionLoading(false);
    }
  }

  async function cancelBooking() {
    if (!booking) {
      return;
    }

    setActionLoading(true);
    setError(undefined);

    try {
      await primaApi.cancelBooking(booking.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Booking could not be cancelled.');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <AppScreen eyebrow="Booking" title="Booking detail">
      {loading ? (
        <Surface>
          <Text style={styles.title}>Loading booking…</Text>
          <Text style={styles.body}>Refreshing the latest booking, payment, and partner state.</Text>
        </Surface>
      ) : null}

      {error ? (
        <Surface>
          <Text style={styles.title}>We could not load this booking</Text>
          <Text style={styles.body}>{error}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </Surface>
      ) : null}

      {booking ? (
        <>
          <Surface accent>
            <View style={styles.row}>
              <Text style={styles.eyebrow}>{partner?.name.toUpperCase() ?? 'VERIFIED PARTNER'}</Text>
              <StatusChip tone={booking.status === 'cancelled' ? 'warning' : booking.status === 'completed' ? 'neutral' : 'success'}>
                {customerStatusLabel(booking, payment)}
              </StatusChip>
            </View>
            <Text style={styles.heroTitle}>{status?.label}</Text>
            <Text style={styles.body}>{status?.body}</Text>
            <Text style={styles.reference}>Reference {booking.id.slice(-8).toUpperCase()}</Text>
          </Surface>

          <Surface>
            <SectionHeading eyebrow="Appointment" title={formatService(booking.serviceCode)} />
            <DetailRow label="When" value={formatAppointment(booking.scheduledStartAt)} />
            <DetailRow label="Vehicle" value={formatVehicle(vehicle)} />
            <DetailRow label="Partner" value={partner?.name ?? booking.partnerLocationId} />
            <DetailRow label="Address" value={partner ? `${partner.addressLine1}, ${partner.city}` : 'Loading partner address'} />
            <DetailRow label="Total" value={formatMoney(booking.acceptedPrice)} strong />
          </Surface>

          <Surface>
            <SectionHeading eyebrow="Payment" title={payment ? `Payment ${payment.status.replaceAll('_', ' ')}` : 'Payment not created'} />
            <Text style={styles.body}>
              {payment
                ? payment.status === 'authorized'
                  ? 'Payment is authorized. It will be captured only when the service is completed.'
                  : payment.status === 'captured'
                    ? 'Payment was captured after service completion.'
                    : payment.status === 'voided'
                      ? 'Payment authorization was voided after cancellation.'
                      : 'Payment authorization still needs attention.'
                : 'No payment intent exists yet for this booking.'}
            </Text>
            {needsPayment ? (
              <PrimaryButton label="Complete payment authorization" loading={actionLoading} onPress={authorizePayment} />
            ) : null}
          </Surface>

          <Surface>
            <SectionHeading eyebrow="Live timeline" title="Operational progress" />
            {booking.status === 'cancelled' ? (
              <TimelineRow active complete label="Cancelled" body="Booking cancelled before completion." />
            ) : (
              timeline.map((item, index) => (
                <TimelineRow
                  key={item.status}
                  active={index === activeIndex}
                  body={item.body}
                  complete={activeIndex >= index}
                  label={item.label}
                />
              ))
            )}
          </Surface>

          <Surface>
            <SectionHeading eyebrow="Actions" title="Manage this booking" />
            {partner ? (
              <Pressable onPress={() => void openDirections(partner, partner.name)}>
                <Text style={styles.link}>Open driving directions ↗</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => router.push('/profile/help')}>
              <Text style={styles.link}>Contact support</Text>
            </Pressable>
            {canCancel ? (
              <Pressable
                disabled={actionLoading}
                onPress={() =>
                  Alert.alert('Cancel this booking?', 'Any authorized payment hold will be released.', [
                    { text: 'Keep booking', style: 'cancel' },
                    {
                      text: 'Cancel booking',
                      style: 'destructive',
                      onPress: () => void cancelBooking(),
                    },
                  ])
                }>
                <Text style={styles.danger}>Cancel booking</Text>
              </Pressable>
            ) : null}
          </Surface>
        </>
      ) : null}
    </AppScreen>
  );
}

function DetailRow({ label, value, strong = false }: { readonly label: string; readonly value: string; readonly strong?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

function getStatusCopy(booking: Booking, payment?: PaymentIntent | null) {
  if (booking.status === 'pending_payment' && payment?.status === 'authorized') {
    return authorizedPendingStatus;
  }

  return statusCopy[booking.status];
}

function customerStatusLabel(booking: Booking, payment?: PaymentIntent | null) {
  if (booking.status === 'pending_payment' && payment?.status === 'authorized') {
    return 'Awaiting confirmation';
  }

  return booking.status.replaceAll('_', ' ');
}

function TimelineRow({
  label,
  body,
  active,
  complete,
}: {
  readonly label: string;
  readonly body: string;
  readonly active: boolean;
  readonly complete: boolean;
}) {
  return (
    <View style={styles.timelineRow}>
      <View style={[styles.dot, complete && styles.dotComplete, active && styles.dotActive]} />
      <View style={styles.timelineCopy}>
        <Text style={[styles.timelineTitle, complete && styles.timelineTitleComplete]}>{label}</Text>
        <Text style={styles.timelineBody}>{body}</Text>
      </View>
    </View>
  );
}

function formatVehicle(vehicle?: Vehicle) {
  if (!vehicle) {
    return 'Saved vehicle';
  }

  const makeModel = `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim();
  return `${makeModel || vehicle.nickname || 'Vehicle'} · ${vehicle.plateNumber}`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  eyebrow: { flex: 1, color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  heroTitle: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.8 },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  reference: { color: colors.subtle, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  detailLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  detailValue: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  strong: { color: colors.accent, fontSize: 17, fontWeight: '900' },
  timelineRow: { flexDirection: 'row', gap: spacing.md },
  dot: { width: 13, height: 13, borderRadius: 7, backgroundColor: colors.border, marginTop: 3 },
  dotComplete: { backgroundColor: colors.accentStrong },
  dotActive: { backgroundColor: colors.accent },
  timelineCopy: { flex: 1, gap: 3, paddingBottom: spacing.md },
  timelineTitle: { color: colors.subtle, fontSize: 13, fontWeight: '800' },
  timelineTitleComplete: { color: colors.text },
  timelineBody: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  link: { color: colors.accent, fontSize: 13, fontWeight: '900', paddingVertical: spacing.sm },
  danger: { color: colors.danger, fontSize: 13, fontWeight: '900', paddingVertical: spacing.sm },
});
