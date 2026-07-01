import type { AvailabilitySearchSlot, BookingOnsiteServiceMode } from '@prima-wash/contracts';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton } from '@/components/prima-ui';
import { colors, radius, spacing } from '@/constants/design';
import { useBooking } from '@/context/booking-context';
import { primaApi } from '@/lib/api';

const SEARCH_DAYS = 7;

export default function TimeScreen() {
  const { draft, setHeldSlot } = useBooking();
  const dateOptions = useMemo(() => buildDateOptions(), []);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0]?.value ?? '');
  const [slots, setSlots] = useState<readonly AvailabilitySearchSlot[]>([]);
  const [closedReason, setClosedReason] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [holdingSlotKey, setHoldingSlotKey] = useState<string>();
  const [error, setError] = useState<string>();
  const partnerId = draft.partner?.id;
  const serviceCode = draft.service?.code;
  const vehicleId = draft.vehicle?.id;
  const serviceMode = draft.onsiteServiceMode ?? 'partner_location';
  const activeHoldForSelectedDate =
    draft.hold?.status === 'active' && toIsoDate(new Date(draft.hold.startsAt)) === selectedDate ? draft.hold : undefined;

  const load = useCallback(async () => {
    if (!partnerId || !serviceCode) {
      setError('Choose a partner and service before selecting a time.');
      setSlots([]);
      setClosedReason(undefined);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const response = await primaApi.availabilitySearch({
        partnerLocationId: partnerId,
        serviceCode,
        date: selectedDate,
      });
      setSlots(response.slots);
      setClosedReason(response.closedReason);
    } catch (caught) {
      setSlots([]);
      setClosedReason(undefined);
      setError(caught instanceof Error ? caught.message : 'Appointment times could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [partnerId, selectedDate, serviceCode]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeoutId);
  }, [load]);

  async function holdAndContinue(slot: AvailabilitySearchSlot) {
    if (!partnerId || !serviceCode || !vehicleId) {
      setError('Choose a vehicle before selecting a time.');
      return;
    }

    setHoldingSlotKey(slot.startsAt);
    setError(undefined);
    try {
      if (draft.hold && draft.hold.status === 'active' && draft.hold.startsAt !== slot.startsAt) {
        await primaApi.releaseBookingHold(draft.hold.id).catch(() => undefined);
      }
      const response = await primaApi.createBookingHold({
        vehicleId,
        partnerLocationId: partnerId,
        serviceCode,
        startsAt: slot.startsAt,
      });
      setHeldSlot(slot, response.hold);
      router.push('/booking/review');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This time was just taken. Pick another appointment.');
      await load();
    } finally {
      setHoldingSlotKey(undefined);
    }
  }

  return (
    <AppScreen eyebrow="Step 2 of 3" title="Choose a time">
      <Text style={styles.intro}>
        {formatServiceMode(serviceMode)} - {draft.partner?.name ?? 'Selected partner'} - {draft.service?.name ?? 'Selected service'} - Times shown in partner local time.
      </Text>

      <View style={styles.dateRail}>
        {dateOptions.map((option) => {
          const selected = option.value === selectedDate;
          return (
            <Pressable
              key={option.value}
              onPress={() => setSelectedDate(option.value)}
              style={({ pressed }) => [styles.dateChip, selected && styles.dateChipSelected, pressed && styles.pressed]}>
              <Text style={[styles.dateWeekday, selected && styles.dateTextSelected]}>{option.weekday}</Text>
              <Text style={[styles.dateDay, selected && styles.dateTextSelected]}>{option.day}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? <ActivityIndicator color={colors.accent} size="large" /> : null}

      {error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Times are temporarily unavailable</Text>
          <Text style={styles.intro}>{error}</Text>
          <Pressable onPress={() => void load()}><Text style={styles.retry}>Try again</Text></Pressable>
        </View>
      ) : null}

      {!loading && !error && slots.length > 0 ? (
        <View style={styles.day}>
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>Available appointments</Text>
            <Text style={styles.dayMeta}>{slots.length} options</Text>
          </View>
          <View style={styles.slotGrid}>
            {slots.map((slot) => {
              const selected = activeHoldForSelectedDate?.startsAt === slot.startsAt;
              const holding = holdingSlotKey === slot.startsAt;
              return (
                <Pressable
                  key={`${slot.startsAt}-${slot.endsAt}`}
                  disabled={Boolean(holdingSlotKey)}
                  onPress={() => void holdAndContinue(slot)}
                  style={({ pressed }) => [styles.slot, selected && styles.slotSelected, pressed && styles.pressed]}>
                  <Text style={[styles.slotTime, selected && styles.slotTimeSelected]}>
                    {formatTime(slot.startsAt)}
                  </Text>
                  <Text style={[styles.slotCapacity, selected && styles.slotTimeSelected]}>
                    {holding ? 'Holding…' : `${slot.availableCount} available`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {!loading && !error && slots.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{closedReason ? 'Closed on this date' : 'No matching times'}</Text>
          <Text style={styles.intro}>
            {closedReason ?? 'Try another day, choose another service, or select a different partner.'}
          </Text>
          <View style={styles.emptyActions}>
            <Pressable onPress={() => void load()}><Text style={styles.retry}>Refresh times</Text></Pressable>
            <Pressable onPress={() => router.back()}><Text style={styles.secondary}>Change service</Text></Pressable>
          </View>
        </View>
      ) : null}

      <PrimaryButton
        disabled={!draft.partner || !draft.service || !draft.vehicle || !activeHoldForSelectedDate || loading || Boolean(error)}
        label={activeHoldForSelectedDate ? 'Review held appointment' : holdingSlotKey ? 'Holding appointment…' : 'Select a time to continue'}
        loading={Boolean(holdingSlotKey)}
        onPress={() => router.push('/booking/review')}
      />
    </AppScreen>
  );
}

function buildDateOptions() {
  return Array.from({ length: SEARCH_DAYS }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const value = toIsoDate(date);
    return {
      value,
      weekday: index === 0 ? 'Today' : date.toLocaleDateString([], { weekday: 'short' }),
      day: date.toLocaleDateString([], { month: 'short', day: 'numeric' }),
    };
  });
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatServiceMode(mode: BookingOnsiteServiceMode) {
  if (mode === 'pickup_return') return 'Pickup and return';
  if (mode === 'customer_property') return 'At my residence';
  return 'Drive to partner';
}

const styles = StyleSheet.create({
  intro: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: -spacing.sm },
  dateRail: { flexDirection: 'row', gap: spacing.sm },
  dateChip: {
    minWidth: 76,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  dateChipSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  dateWeekday: { color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  dateDay: { color: colors.text, fontSize: 13, fontWeight: '900' },
  dateTextSelected: { color: colors.black },
  day: { gap: spacing.md },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  dayTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  dayMeta: { color: colors.subtle, fontSize: 12, fontWeight: '700' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    minWidth: 104,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  slotSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  slotTime: { color: colors.text, fontSize: 13, fontWeight: '800' },
  slotTimeSelected: { color: colors.black },
  slotCapacity: { color: colors.subtle, fontSize: 11, fontWeight: '700' },
  pressed: { opacity: 0.82 },
  empty: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.surface },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: spacing.sm },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl, marginTop: spacing.sm },
  retry: { color: colors.accent, fontSize: 13, fontWeight: '800', paddingVertical: spacing.sm },
  secondary: { color: colors.text, fontSize: 13, fontWeight: '800', paddingVertical: spacing.sm },
});
