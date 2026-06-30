import type { AvailabilitySlot, Booking, PaymentIntent, Vehicle } from '@prima-wash/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton, SectionHeading, Surface } from '@/components/prima-ui';
import { colors, spacing } from '@/constants/design';
import { useBooking } from '@/context/booking-context';
import { useNotifications } from '@/context/notification-context';
import { primaApi } from '@/lib/api';
import { formatAppointment, formatMoney } from '@/lib/format';

export default function ReviewScreen() {
  const { draft } = useBooking();
  const { preferences, supported: notificationsSupported } = useNotifications();
  const [submitting, setSubmitting] = useState(false);
  const [pendingBooking, setPendingBooking] = useState<Booking>();
  const [pendingPayment, setPendingPayment] = useState<PaymentIntent>();
  const [error, setError] = useState<string>();
  const locationName = draft.primaWashDay?.propertyName ?? draft.partner?.name;
  const onsiteServiceMode = draft.primaWashDay ? 'onsite' : draft.onsiteServiceMode ?? 'onsite';
  const canSubmit = Boolean(draft.service && draft.slot && draft.vehicle && (draft.partner || draft.primaWashDay));

  async function confirmBooking() {
    if (!draft.service || !draft.slot || !draft.vehicle || (!draft.partner && !draft.primaWashDay)) {
      setError('Choose a location, vehicle, service, and appointment time first.');
      return;
    }

    if (!pendingBooking && draft.hold && new Date(draft.hold.expiresAt).getTime() <= Date.now()) {
      setError('This appointment hold has expired. Go back and choose a time again.');
      return;
    }

    setSubmitting(true);
    setError(undefined);
    try {
      const booking = pendingBooking ?? await primaApi.createBooking({
        vehicleId: draft.vehicle.id,
        ...(draft.primaWashDay
          ? { primaWashDayId: draft.primaWashDay.id }
          : draft.hold
            ? { holdId: draft.hold.id }
            : isLegacyAvailabilitySlot(draft.slot)
              ? { availabilitySlotId: draft.slot.id }
              : {}),
        serviceCode: draft.service.code,
        onsiteServiceMode,
      });
      setPendingBooking(booking);
      const existingPayment = pendingPayment ?? await primaApi.paymentForBooking(booking.id);
      const payment = existingPayment ?? await primaApi.createPaymentIntent({ bookingId: booking.id });
      setPendingPayment(payment);
      const checkoutPath = `/booking/checkout?bookingId=${encodeURIComponent(booking.id)}&paymentIntentId=${encodeURIComponent(payment.id)}`;
      router.push(checkoutPath as never);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The booking could not be completed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppScreen eyebrow="Step 3 of 3" title="Review and pay">
      <Surface accent>
        <SectionHeading eyebrow={draft.primaWashDay ? 'Condo service day' : 'Verified partner'} title={locationName ?? 'Choose a location'} />
        <Text style={styles.rating}>
          {draft.primaWashDay
            ? `${draft.primaWashDay.approvedServiceArea} - management-approved operating window`
            : `${draft.partner?.rating.toFixed(1) ?? '-'} stars - Quality checked - ${draft.partner?.distanceKm.toFixed(1) ?? '-'} km away`}
        </Text>
      </Surface>
      <Surface>
        <SectionHeading
          eyebrow="Vehicle for this booking"
          title={draft.vehicle ? formatVehicleName(draft.vehicle) : 'Choose a vehicle'}
          trailing={
            <Pressable onPress={() => router.push('/booking/service')}>
              <Text style={styles.changeAction}>Change</Text>
            </Pressable>
          }
        />
        <Text style={styles.payment}>
          {draft.vehicle
            ? `${draft.vehicle.plateNumber}${draft.vehicle.isPrimary ? ' - Primary garage vehicle' : ''}`
            : 'Add or select a saved garage vehicle before payment.'}
        </Text>
      </Surface>
      <Surface>
        <SummaryRow label="Service" value={draft.service?.name ?? 'Choose a service'} />
        <SummaryRow label="Care mode" value={formatServiceMode(onsiteServiceMode)} />
        <SummaryRow label="Appointment" value={draft.slot ? formatAppointment(draft.slot.startsAt) : 'Choose a time'} />
        {draft.hold ? <SummaryRow label="Reserved until" value={formatHoldExpiry(draft.hold.expiresAt)} /> : null}
        {draft.primaWashDay ? <SummaryRow label="Service area" value={draft.primaWashDay.approvedServiceArea} /> : null}
        <View style={styles.divider} />
        <SummaryRow label="Service total" value={draft.service ? formatMoney(draft.service.price) : '$0.00'} strong />
      </Surface>
      {draft.hold ? (
        <Surface>
          <SectionHeading eyebrow="Appointment hold" title="This time is temporarily reserved" />
          <Text style={styles.payment}>
            We will consume this hold when you confirm. If it expires, go back to choose a fresh time.
          </Text>
        </Surface>
      ) : null}
      {draft.primaWashDay ? (
        <Surface>
          <SectionHeading eyebrow="Condo operations" title="Temporary on-site service" />
          <Text style={styles.payment}>
            Prima Wash will coordinate this booking inside the approved condo operating window and service area.
          </Text>
        </Surface>
      ) : null}
      {onsiteServiceMode === 'pickup_return' ? (
        <Surface>
          <SectionHeading eyebrow="Pickup and return" title="Vehicle handover required" />
          <Text style={styles.payment}>
            Prima Wash will coordinate pickup, care, and return with the partner. Final handover notes can be confirmed after payment.
          </Text>
        </Surface>
      ) : null}
      <Surface>
        <SectionHeading eyebrow="Payment" title="Protected checkout" />
        <Text style={styles.payment}>
          We will create a secure payment authorization next. Payment is captured only after care is completed.
        </Text>
      </Surface>
      <Surface>
        <SectionHeading eyebrow="Reminders" title={preferences.appointmentReminders ? 'Reminder enabled' : 'Reminder off'} />
        <Text style={styles.payment}>
          {notificationsSupported
            ? preferences.appointmentReminders
              ? `${draft.service?.name ?? 'Appointment'} reminder will be scheduled after confirmation if notification permission is allowed.`
              : 'Appointment reminders are off in Profile. This booking will not schedule a device reminder.'
            : 'Web preview cannot schedule device reminders. iOS and Android builds can.'}
        </Text>
      </Surface>
      {error ? (
        <Surface>
          <Text style={styles.errorTitle}>{pendingBooking ? 'Your appointment is held' : 'We could not complete checkout'}</Text>
          <Text style={styles.payment}>{error}</Text>
          {pendingBooking ? (
            <Text style={styles.recovery}>Retry resumes payment for this booking. It will not create a duplicate appointment.</Text>
          ) : null}
          <Pressable onPress={() => void confirmBooking()}><Text style={styles.retry}>Retry checkout</Text></Pressable>
        </Surface>
      ) : null}
      <Text style={styles.policy}>Free cancellation before vehicle check-in. By confirming, you agree to the booking and cancellation terms.</Text>
      <PrimaryButton
        disabled={!canSubmit}
        label={pendingBooking ? 'Continue secure payment' : 'Continue to secure checkout'}
        loading={submitting}
        onPress={confirmBooking}
      />
    </AppScreen>
  );
}

function SummaryRow({ label, value, strong = false }: { readonly label: string; readonly value: string; readonly strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

function isLegacyAvailabilitySlot(slot: unknown): slot is AvailabilitySlot {
  return Boolean(slot && typeof slot === 'object' && 'id' in slot);
}

function formatHoldExpiry(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatServiceMode(mode: 'onsite' | 'pickup_return') {
  return mode === 'pickup_return' ? 'Pickup and return' : 'Drive to carer / on-site';
}

function formatVehicleName(vehicle: Vehicle) {
  return `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() || vehicle.nickname || 'Vehicle';
}

const styles = StyleSheet.create({
  rating: { color: colors.muted, fontSize: 13 },
  changeAction: { color: colors.accent, fontSize: 12, fontWeight: '900', paddingVertical: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xl },
  label: { color: colors.muted, fontSize: 13 },
  value: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  strong: { color: colors.accent, fontSize: 18, fontWeight: '900' },
  divider: { height: 1, backgroundColor: colors.border },
  payment: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  errorTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  recovery: { color: colors.warning, fontSize: 12, lineHeight: 18 },
  retry: { color: colors.accent, fontSize: 13, fontWeight: '800', paddingVertical: spacing.sm },
  policy: { color: colors.subtle, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
