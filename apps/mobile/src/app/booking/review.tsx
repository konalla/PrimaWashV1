import type { AvailabilitySlot, Booking, BookingOnsiteServiceMode, PaymentIntent, Vehicle } from '@prima-wash/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton, SectionHeading, Surface } from '@/components/prima-ui';
import { colors, radius, spacing } from '@/constants/design';
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
  const [acceptedOperationalConsent, setAcceptedOperationalConsent] = useState(false);
  const [error, setError] = useState<string>();
  const locationName = draft.primaWashDay?.propertyName ?? draft.partner?.name;
  const onsiteServiceMode: BookingOnsiteServiceMode = draft.primaWashDay ? 'customer_property' : draft.onsiteServiceMode ?? 'partner_location';
  const consentType = requiredConsentType(onsiteServiceMode);
  const consentRequired = Boolean(consentType);
  const canSubmit = Boolean(
    draft.service &&
      draft.slot &&
      draft.vehicle &&
      (draft.partner || draft.primaWashDay) &&
      (!consentRequired || acceptedOperationalConsent),
  );

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
        ...(draft.executionNotes ? { executionNotes: draft.executionNotes } : {}),
      });
      setPendingBooking(booking);
      if (consentType) {
        await primaApi.createBookingConsent(booking.id, {
          consentType,
          termsVersion: '2026-07-05',
          acceptedText: consentText(onsiteServiceMode),
        });
      }
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
    <AppScreen eyebrow={draft.primaWashDay ? 'Step 3 of 3' : 'Step 4 of 4'} title="Review and pay">
      <View style={styles.checkoutHero}>
        <Text style={styles.heroEyebrow}>{draft.primaWashDay ? 'Condo service day' : 'Verified partner'}</Text>
        <Text style={styles.heroTitle}>{locationName ?? 'Choose a location'}</Text>
        <Text style={styles.heroBody}>
          {draft.primaWashDay
            ? `${draft.primaWashDay.approvedServiceArea} - management-approved operating window`
            : `${draft.partner?.rating.toFixed(1) ?? '-'} stars - Quality checked - ${draft.partner?.distanceKm.toFixed(1) ?? '-'} km away`}
        </Text>
        <View style={styles.heroMetaRow}>
          <View style={styles.heroMeta}><Text style={styles.heroMetaLabel}>Service</Text><Text style={styles.heroMetaValue}>{draft.service?.name ?? 'Choose'}</Text></View>
          <View style={styles.heroMeta}><Text style={styles.heroMetaLabel}>Total</Text><Text style={styles.heroMetaValue}>{draft.service ? formatMoney(draft.service.price) : '$0.00'}</Text></View>
        </View>
      </View>
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
        {draft.executionNotes ? <SummaryRow label="Instructions" value={firstInstructionLine(draft.executionNotes)} /> : null}
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
          <SectionHeading eyebrow="Property operations" title="Temporary approved service" />
          <Text style={styles.payment}>
            Prima Wash will coordinate this booking inside the approved condo operating window and service area.
          </Text>
        </Surface>
      ) : null}
      {onsiteServiceMode === 'customer_property' && !draft.primaWashDay ? (
        <Surface>
          <SectionHeading eyebrow="Property service" title="Service at your saved address" />
          <Text style={styles.payment}>
            The partner will use your residence and access notes where mobile coverage is available. Drive-to-partner remains a separate booking option.
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
      {consentRequired ? (
        <Surface>
          <SectionHeading eyebrow="Required consent" title={consentTitle(onsiteServiceMode)} />
          <Text style={styles.payment}>{consentText(onsiteServiceMode)}</Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedOperationalConsent }}
            onPress={() => setAcceptedOperationalConsent((current) => !current)}
            style={[styles.consentRow, acceptedOperationalConsent && styles.consentRowAccepted]}>
            <View style={[styles.checkbox, acceptedOperationalConsent && styles.checkboxAccepted]}>
              <Text style={styles.checkboxMark}>{acceptedOperationalConsent ? '✓' : ''}</Text>
            </View>
            <Text style={styles.consentLabel}>I understand and agree for this booking.</Text>
          </Pressable>
        </Surface>
      ) : null}
      <Surface>
        <SectionHeading eyebrow="Payment" title="Protected checkout" />
        <Text style={styles.payment}>
          We will create a secure payment authorization next. Payment is captured only after care is completed.
        </Text>
        <View style={styles.trustStrip}>
          <Text style={styles.trustItem}>No surprise charges</Text>
          <Text style={styles.trustItem}>Verified partner</Text>
          <Text style={styles.trustItem}>Prima support</Text>
        </View>
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

function formatServiceMode(mode: BookingOnsiteServiceMode) {
  if (mode === 'pickup_return') return 'Pickup and return';
  if (mode === 'customer_property') return 'At my residence / property';
  return 'Drive to partner location';
}

function requiredConsentType(mode: BookingOnsiteServiceMode) {
  if (mode === 'pickup_return') return 'pickup_return_terms' as const;
  if (mode === 'customer_property' || mode === 'onsite') return 'property_service_terms' as const;
  return undefined;
}

function consentTitle(mode: BookingOnsiteServiceMode) {
  if (mode === 'pickup_return') return 'Pickup, custody, and return';
  return 'Property access and operating area';
}

function consentText(mode: BookingOnsiteServiceMode) {
  if (mode === 'pickup_return') {
    return 'I authorize Prima Wash and its verified partner to coordinate vehicle pickup, service away from the pickup point, and return for this booking. Handover records will be kept for pickup and return.';
  }

  return 'I confirm that Prima Wash and its verified partner may coordinate service at my property or approved operating area for this booking. I understand access, parking, and site rules may affect service.';
}

function firstInstructionLine(value: string) {
  return value.split('\n').find((line) => line.includes(':')) ?? 'Added';
}

function formatVehicleName(vehicle: Vehicle) {
  return `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() || vehicle.nickname || 'Vehicle';
}

const styles = StyleSheet.create({
  checkoutHero: {
    borderWidth: 1,
    borderColor: '#C7D6D2',
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceStrong,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  heroEyebrow: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  heroTitle: { color: colors.text, fontSize: 24, fontWeight: '900', lineHeight: 29 },
  heroBody: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  heroMetaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  heroMeta: { flex: 1, borderWidth: 1, borderColor: '#C7D6D2', borderRadius: radius.md, backgroundColor: colors.canvasRaised, padding: spacing.md },
  heroMetaLabel: { color: colors.subtle, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  heroMetaValue: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 4 },
  rating: { color: colors.muted, fontSize: 13 },
  changeAction: { color: colors.accent, fontSize: 12, fontWeight: '900', paddingVertical: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xl },
  label: { color: colors.muted, fontSize: 13 },
  value: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  strong: { color: colors.accent, fontSize: 18, fontWeight: '900' },
  divider: { height: 1, backgroundColor: colors.border },
  payment: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  trustStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  trustItem: { overflow: 'hidden', borderRadius: radius.pill, backgroundColor: colors.surfaceStrong, color: colors.accent, fontSize: 11, fontWeight: '900', paddingHorizontal: spacing.sm, paddingVertical: 6 },
  errorTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: spacing.md,
    backgroundColor: colors.canvasRaised,
  },
  consentRowAccepted: { borderColor: colors.accent },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxAccepted: { borderColor: colors.accent, backgroundColor: colors.accent },
  checkboxMark: { color: colors.surface, fontSize: 14, fontWeight: '900' },
  consentLabel: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '800', lineHeight: 19 },
  recovery: { color: colors.warning, fontSize: 12, lineHeight: 18 },
  retry: { color: colors.accent, fontSize: 13, fontWeight: '800', paddingVertical: spacing.sm },
  policy: { color: colors.subtle, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
