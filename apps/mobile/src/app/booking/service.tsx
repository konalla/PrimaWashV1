import type { BookingOnsiteServiceMode, ServiceOffering, Vehicle } from '@prima-wash/contracts';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton, StatusChip } from '@/components/prima-ui';
import { colors, radius, spacing } from '@/constants/design';
import { useBooking } from '@/context/booking-context';
import { primaApi } from '@/lib/api';
import { formatMoney } from '@/lib/format';

const descriptions: Record<ServiceOffering['code'], string> = {
  wash_basic: 'Exterior hand wash, wheels, windows, and dry.',
  wash_premium: 'Deep exterior care with finish protection and detail.',
  detail_interior: 'Vacuum, surfaces, mats, glass, and cabin refresh.',
};

export default function ServiceScreen() {
  const { draft, setService, setVehicle } = useBooking();
  const [services, setServices] = useState<readonly ServiceOffering[]>([]);
  const [vehicles, setVehicles] = useState<readonly Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const hasSelectedVehicle = Boolean(draft.vehicle);
  const isPrimaWashDayBooking = Boolean(draft.primaWashDay);
  const selectedVehicle = draft.vehicle;
  const serviceMode: BookingOnsiteServiceMode = draft.primaWashDay ? 'customer_property' : draft.onsiteServiceMode ?? 'partner_location';

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [nextServices, nextVehicles] = await Promise.all([primaApi.services(), primaApi.vehicles()]);
      setServices(nextServices);
      setVehicles(nextVehicles);
      if (!hasSelectedVehicle) {
        const preferred = nextVehicles.find((vehicle) => vehicle.isPrimary) ?? nextVehicles[0];
        if (preferred) setVehicle(preferred);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Services could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [hasSelectedVehicle, setVehicle]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeoutId);
  }, [load]);

  const availableServices = draft.primaWashDay
    ? services.filter((service) => draft.primaWashDay?.serviceCodes.includes(service.code))
    : draft.partner
      ? services.filter((service) => draft.partner?.serviceCodes.includes(service.code))
      : [];

  return (
    <AppScreen eyebrow="Step 1 of 3" title="Choose your care">
      <Text style={styles.intro}>
        {draft.primaWashDay
          ? `${formatServiceMode(serviceMode)} - ${draft.primaWashDay.propertyName} - ${new Date(draft.primaWashDay.startsAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`
          : draft.partner
            ? `${formatServiceMode(serviceMode)} - ${draft.partner.name} - ${draft.partner.rating.toFixed(1)} stars - ${draft.partner.distanceKm.toFixed(1)} km`
            : 'Choose a verified partner before selecting your care.'}
      </Text>
      {!draft.partner && !draft.primaWashDay ? (
        <Pressable onPress={() => router.replace('/partners')} style={styles.addVehicle}>
          <Text style={styles.name}>Choose a partner</Text>
          <Text style={styles.description}>Compare ratings, distance, services, and live availability.</Text>
        </Pressable>
      ) : null}
      <View style={styles.sectionHeader}>
        <Text style={styles.groupLabel}>Vehicle for this booking</Text>
        <Pressable onPress={() => router.push('/garage/vehicle')}>
          <Text style={styles.headerAction}>Add vehicle</Text>
        </Pressable>
      </View>
      {selectedVehicle ? (
        <View style={styles.selectedVehicleCard}>
          <View style={styles.selectedVehicleCopy}>
            <Text style={styles.selectedVehicleLabel}>Selected vehicle</Text>
            <Text style={styles.selectedVehicleName}>{formatVehicleName(selectedVehicle)}</Text>
            <Text style={styles.selectedVehicleMeta}>
              {selectedVehicle.plateNumber}{selectedVehicle.isPrimary ? ' - Primary garage vehicle' : ''}
            </Text>
          </View>
          <View style={styles.selectedBadge}>
            <Text style={styles.selectedBadgeText}>Booked</Text>
          </View>
        </View>
      ) : null}
      {vehicles.length === 0 ? (
        <Pressable onPress={() => router.push('/garage/vehicle')} style={styles.addVehicle}>
          <Text style={styles.name}>Add a vehicle first</Text>
          <Text style={styles.description}>Save your vehicle once and reuse it for future bookings.</Text>
        </Pressable>
      ) : (
        <View style={styles.vehicleList}>
          {vehicles.map((vehicle) => {
            const selected = selectedVehicle?.id === vehicle.id;
            return (
              <Pressable key={vehicle.id} onPress={() => setVehicle(vehicle)} style={[styles.vehicleChoice, selected && styles.vehicleChoiceSelected]}>
                <Text style={styles.vehicleName}>{formatVehicleName(vehicle)}</Text>
                <Text style={styles.duration}>{vehicle.plateNumber}{vehicle.isPrimary ? ' - Primary' : ''}</Text>
                <Text style={[styles.vehicleAction, selected && styles.vehicleActionSelected]}>
                  {selected ? 'Selected for booking' : 'Use this vehicle'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <Text style={styles.groupLabel}>Choose a service</Text>
      {loading ? <ActivityIndicator color={colors.accent} size="large" /> : null}
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>We could not load booking options</Text>
          <Text style={styles.description}>{error}</Text>
          <Pressable onPress={() => void load()}><Text style={styles.retry}>Try again</Text></Pressable>
        </View>
      ) : null}
      {!loading && !error && (draft.partner || draft.primaWashDay) && availableServices.length === 0 ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No services are available here</Text>
          <Text style={styles.description}>
            {draft.primaWashDay ? 'This Prima Wash Day needs service options before it can be booked.' : 'Choose another verified partner to continue.'}
          </Text>
          <Pressable onPress={() => router.replace(draft.primaWashDay ? '/condo/prima-wash-days' as never : '/partners')}>
            <Text style={styles.retry}>{draft.primaWashDay ? 'View service days' : 'Browse partners'}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.list}>
        {availableServices.map((service, index) => {
          const selected = draft.service?.code === service.code;
          return (
            <Pressable
              key={service.code}
              onPress={() => setService(service)}
              style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.pressed]}>
              <View style={styles.topRow}>
                <Text style={styles.name}>{service.name}</Text>
                {index === 1 ? <StatusChip>Most popular</StatusChip> : null}
              </View>
              <Text style={styles.description}>{descriptions[service.code]}</Text>
              <View style={styles.bottomRow}>
                <Text style={styles.duration}>{service.durationMinutes} min</Text>
                <Text style={styles.price}>{formatMoney(service.price)}</Text>
              </View>
              {selected ? <Text style={styles.selected}>Selected</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <PrimaryButton
        disabled={(!draft.partner && !draft.primaWashDay) || !draft.service || !draft.vehicle || loading || Boolean(error)}
        label={loading ? 'Loading services...' : isPrimaWashDayBooking ? 'Review condo booking' : 'Choose appointment time'}
        onPress={() => router.push(isPrimaWashDayBooking ? '/booking/review' : '/booking/time')}
      />
    </AppScreen>
  );
}

function formatVehicleName(vehicle: Vehicle) {
  return `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() || vehicle.nickname || 'Vehicle';
}

function formatServiceMode(mode: BookingOnsiteServiceMode) {
  if (mode === 'pickup_return') return 'Pickup and return';
  if (mode === 'customer_property') return 'At my residence';
  return 'Drive to partner';
}

const styles = StyleSheet.create({
  intro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: -spacing.sm },
  list: { gap: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  groupLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  headerAction: { color: colors.accent, fontSize: 12, fontWeight: '900' },
  selectedVehicleCard: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceStrong,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  selectedVehicleCopy: { flex: 1, gap: 3 },
  selectedVehicleLabel: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  selectedVehicleName: { color: colors.text, fontSize: 20, fontWeight: '900' },
  selectedVehicleMeta: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  selectedBadge: { borderRadius: radius.pill, backgroundColor: colors.accent, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  selectedBadgeText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  vehicleList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  vehicleChoice: { minWidth: 145, flexGrow: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.md },
  vehicleChoiceSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceStrong },
  vehicleName: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 4 },
  vehicleAction: { color: colors.accent, fontSize: 11, fontWeight: '900', marginTop: spacing.sm },
  vehicleActionSelected: { color: colors.text },
  addVehicle: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.accent, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.surface },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.md },
  cardSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceStrong },
  pressed: { opacity: 0.84 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  name: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '800' },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between' },
  duration: { color: colors.subtle, fontSize: 12, fontWeight: '700' },
  price: { color: colors.accent, fontSize: 17, fontWeight: '900' },
  selected: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  errorCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.sm },
  errorTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  retry: { color: colors.accent, fontSize: 13, fontWeight: '800', paddingVertical: spacing.sm },
});
